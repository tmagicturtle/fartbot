/**
 * Commands
 * Cassius - https://github.com/sirDonovan/Cassius
 *
 * This file contains the base commands for Cassius.
 *
 * @license MIT license
 */

'use strict';

// Users who use the settour command when a tournament is already
// scheduled will be added here and prompted to reuse the command.
// This prevents accidentally overwriting a scheduled tournament.
/**@type {Map<string, string>} */
let overwriteWarnings = new Map();

const juration = require('./lib/juration');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

let repeatTimers = {};
var first = true;

/**@type {{[k: string]: Command | string}} */
let commands = {
	// Developer commands
	js: 'eval',
	eval: function (target, room, user) {
		if (!user.isDeveloper()) return;
		try {
			target = eval(target);
			this.say(JSON.stringify(target));
		} catch (e) {
			this.say(e.name + ": " + e.message);
		}
	},

	// General commands
	about: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		this.say(Config.username + " code by sirDonovan and fart: https://github.com/tmagicturtle/fartbot");
	},
	help: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		if (!Config.guide) return this.say("There is no guide available.");
		this.say(Users.self.name + " guide: " + Config.guide);
	},
	
	mail: function (target, room, user) {
		if (!(room instanceof Users.User) || !Config.allowMail) return;
		let targets = target.split(',');
		if (targets.length < 2) return this.say("Please use the following format: .mail user, message");
		let to = Tools.toId(targets[0]);
		if (!to || to.length > 18 || to === Users.self.id || to.startsWith('guest')) return this.say("Please enter a valid username");
		let message = targets.slice(1).join(',').trim();
		let id = Tools.toId(message);
		if (!id) return this.say("Please include a message to send.");
		if (message.length > (258 - user.name.length)) return this.say("Your message is too long.");
		let database = Storage.getDatabase('global');
		if (to in database.mail) {
			let queued = 0;
			for (let i = 0, len = database.mail[to].length; i < len; i++) {
				if (Tools.toId(database.mail[to][i].from) === user.id) queued++;
			}
			if (queued >= 3) return this.say("You have too many messages queued for " + Users.add(targets[0]).name + ".");
		} else {
			database.mail[to] = [];
		}
		database.mail[to].push({time: Date.now(), from: user.name, text: message});
		Storage.exportDatabase('global');
		this.say("Your message has been sent to " + Users.add(targets[0]).name + "!");
	},
	
	seerepeats: 'seerepeat',
	seerepeat: function (target, room, user) {
		if (!user.isDeveloper()) return;
		Tools.uploadToHastebin(JSON.stringify(Storage.globalDatabase.repeat), /**@param {string} hastebinUrl */ hastebinUrl => {
			this.say("All repeats: " + hastebinUrl);
		});
	},
	
	settopic: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '@') && !user.isDeveloper()) return;
		if (room instanceof Users.User) {
			var res = target.split("|");
			if (res.length === 1) {
				this.say("Format: ~settopic room|topic");
			} else {
				var roomid = res[0].toLowerCase().replace(/\s/g, '');
				var roomobj = Rooms.rooms[roomid];
				if (!user.hasRank(roomobj, '@') && !user.isDeveloper()) {this.say("Insufficient privileges."); return;}
				global.topic[roomid] = res[1];
				this.say("Topic set in "+roomid+".");
			}
		} else {
			global.topic[room.id] = target;
			this.say("Topic set.");
		}
	},
	
	settopichtml: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '@') && !user.isDeveloper()) return;
		if (room instanceof Users.User) {
			var res = target.split("|");
			if (res.length === 1) {
				this.say("Format: ~settopichtml room|topic");
			} else {
				var roomid = res[0].toLowerCase().replace(/\s/g, '');
				var roomobj = Rooms.rooms[roomid];
				if (!user.hasRank(roomobj, '@') && !user.isDeveloper()) {this.say("Insufficient privileges."); return;}
				global.topic[roomid] = "/adduhtml t, "+res[1]+"<style>";
				this.say("Topic set in "+roomid+".");
			}
		} else {
			global.topic[room.id] = "/adduhtml t, "+target+"<style>";
			this.say("Topic set.");
		}
	},
	
	topic: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '%') && !user.isDeveloper()) return;
		if (global.topic[room.id]) {
			this.say(global.topic[room.id]);
		} else {
			this.say("No topic found for this room.");
		}
	},
	
	repeat: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '%') && !user.isDeveloper()) return;
		let targetRoom = this.room instanceof Users.User ? 'in PM' : this.room.id;
		if (targetRoom === 'lobby' && !user.hasRank(room, '@') && !user.isDeveloper()) return;
		let [interval, times, ...repeatMsg] = target.split('|');
		if (!(interval && times && repeatMsg.length)) return this.say("/w " + user.name + ", Syntax: ~repeat <interval>| <times>| <target to repeat>");
		if (!(Number(interval))){
		try {
			interval = juration.parse(interval) * 1000;
		} catch(err) {
			interval = Number(interval) * MINUTE;
		}} else { interval = Number(interval) * MINUTE; }
		if (!interval) return this.say("/w " + user.name + ", Invalid value for interval.");
		if (interval < 5000) { interval = 5000; }
		times = Number(times);
		if (!times) return this.say("/w " + user.name + ", Invalid value for times");
		repeatMsg = repeatMsg.join(',').trim();
		if (repeatMsg.startsWith('/leave') || repeatMsg.startsWith('/part') || (repeatMsg.startsWith('/m') && !repeatMsg.startsWith('/me')) || repeatMsg.startsWith('/hm') || repeatMsg.startsWith('/roomban') || repeatMsg.startsWith('/rb') || repeatMsg.startsWith('/k') || repeatMsg.startsWith('/pm') || repeatMsg.startsWith('/warn')) return this.say("/w " + user.name + ", Please do not enter moderation commands in ``\\repeat``");
		let id = repeatMsg;
		let database = Storage.getDatabase('global');
		if (id in database.repeat) return this.say("/w " + user.name + ", This message is already being repeated.");
		let repeatObj = {msg: repeatMsg, timesLeft: times, interval: interval, room: this.room.id};
		database.repeat[id] = (repeatObj);
		repeatTimers[id] = setTimeout(() => runRepeat(id), interval);
		Storage.exportDatabase('global');
		return this.say(repeatMsg);

		function runRepeat(id) {
			let obj = database.repeat[id];
			if (!obj) return; // failsafe
			if (obj.timesLeft--) {
				Client.send(`${obj.room}|${obj.msg}`);
				repeatTimers[id] = setTimeout(() => runRepeat(id), obj.interval);
			} else {
				delete database.repeat[id];
				delete repeatTimers[id];
			}
			Storage.exportDatabase('global');
		}
	},
	clearrepeat: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '%') && !user.isDeveloper()) return;
		let id = target;
		let database = Storage.getDatabase('global');
		if (id in database.repeat) {
			delete database.repeat[id];
			delete repeatTimers[id];
			this.say("Message cleared.");
			Storage.exportDatabase('global');
		} else {return this.say("This message is not being repeated!");}
	},
	
	
	randtopic: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		var pokemonA = require('pokemon-random')();
		var pokemonB = require('pokemon-random')();
		var pokemonC = require('pokemon-random')();
		if (room.id == "lobby") {
			var questions = [
				"/wall How would you improve "+pokemonB+"?",
				"/wall Who would win: "+pokemonA+" or "+pokemonB+"?",
				"/wall Which would be more terrifying in real life: "+pokemonA+" or "+pokemonB+"?",
				"/wall Which Pokémon city or town would you want to live and why?",
			];
		}
			var rand = questions[Math.floor(Math.random() * questions.length)];
			this.say(rand);
	},


};

module.exports = commands;