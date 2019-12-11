/**
 *	Copyright(c) 2014 Jason Miller (http://github.com/developit/)
 *	Copyright(c) 2013 Christophe Hamerling <christophe.hamerling@gmail.com>
 *	MIT Licensed
 */

var express = require('express'),
	compression = require('compression'),
	request = require('request'),
	xmlTemplate = require('fs').readFileSync('template.svg', 'utf8');

exports.colors = {
	green	: '#4EC53A',
	red		: '#e05d44',
	yellow	: '#dfb317',
	grey	: '#9f9f9f',
	gray	: '#9f9f9f'
};

exports.statusColors = {
	'successful'	: 'green',
	'failed'		: 'red',
	'pending'		: 'yellow'
};

function htmlentities(text) {
	return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showStatus(req, res, plan, err, response, body) {
	var fields = {
			color : 'grey',
			status : 'Unknown',
			subject : plan
		},
		dur;

	console.log("body: {}", body);

	if (!err && body && body.planName) {
		dur = body.buildDurationInSeconds+'s';
		fields.color = exports.statusColors[body.state.toLowerCase()] || exports.statusColors.grey;
		fields.subject = body.planName;
		if (req.query.title) {
			fields.subject = req.query.title;
		}
		else if (fields.subject.substring(0, body.projectName.length)===body.projectName) {
			fields.subject = fields.subject.substring(body.projectName.length).replace(/^\s+/g, '');
		}
		fields.subject += ' #' + body.number;
		fields.status = body.state;
		if (body.buildTestSummary && (body.state==='Successful' || body.state==='Failed')) {
			fields.status = (body.state==='Succsesful'?'✔':'✖︎') + '︎ ' + (body.failedTestCount || body.successfulTestCount) + ' tests, ◷ ' + dur;
		}
	}
	else if (!err && body && body.results) {
		console.log("results ", body.results.result);
		// const result = body.results.result[body.results.result.length - 1];
		const result = body.results.result[0];
		console.log("result ", result);
		console.log("shortName ", result.master.shortName);

		dur = result.buildDurationInSeconds+'s';
		fields.color = exports.statusColors[result.state.toLowerCase()] || exports.statusColors.grey;
		fields.subject = result.master.shortName;
		// if (req.query.title) {
		// 	fields.subject = req.query.title;
		// }
		// else if (fields.subject.substring(0, result.master.shortName.length)===result.master.shortName) {
		// 	fields.subject = fields.subject.substring(result.master.shortName.length).replace(/^\s+/g, '');
		// }
		fields.subject += ' #' + result.number;
		fields.status = result.state;
		if (result.buildTestSummary && (result.state==='Successful' || result.state==='Failed')) {
			fields.status = (result.state==='Succsesful'?'✔':'✖︎') + '︎ ' + (result.failedTestCount || result.successfulTestCount) + ' tests, ◷ ' + dur;
		}
	}
	else {
		fields.color = 'yellow',
			fields.status = response.statusCode===404 ? 'Not found' : ('Error: ' + err);
	}

	fields.color = exports.colors[fields.color] || fields.color;

	res.writeHead(200, {
		'Content-Type' : 'image/svg+xml;charset=utf-8',
		'Cache-Control' : 'max-age=30',
		'Expires' : new Date(Date.now() + 30000).toUTCString(),
		'X-Bamboo-Status' : body && body.status || err
	});

	res.end(xmlTemplate.replace(/\{\{(.+?)\}\}/g, function(s, key) {
		return htmlentities(fields[key]);
	}));
}

exports.start = function(options, callback) {
	options = options || {};
	if (!options.bamboo) {
		return callback(new Error('"bamboo" option is required'));
	}

	const port = process.env.PORT || options.port || 3000;
	const bambooHost = (options.bamboo.match(/^https?\:\/\//g) ? '' : 'https://') + options.bamboo;
	const bamboo = bambooHost + '/rest/api/latest/';

	const username = options.username;
	const password = options.password;

	const app = express();

	app.use(compression());

	if (options.index===true) {
		app.get('/', function(req, res) {
			res.send(200, {
				bamboo : bamboo
			});
		});
	}

	app.get('/status/:plan', function(req, res) {
		var plan = String(req.params.plan).replace(/[\?\/]/g, '');
		request({
			url : bamboo + 'result/' + plan + '/latest.json',
			auth: {
				username: username,
				password: password
			},
			json : true,
			strictSSL : false
		}, function(err, response, body) {
			showStatus(req, res, plan, err, response, body);
		});
	});

	app.get('/status/:plan/:branch', function(req, res) {
		var plan = String(req.params.plan).replace(/[\?\/]/g, '');
		const branch = String(req.params.branch).replace(/[\?\/]/g, '');
		console.log("plan: {}, branch: {}", {plan, branch});

		request({
			url : bamboo + 'result/' + plan + '/branch/' + branch + '.json',
			auth: {
				username: username,
				password: password
			},
			json : true,
			strictSSL : false
		}, function(err, response, body) {
			showStatus(req, res, plan, err, response, body);
		});
	});

	app.listen(port, function(err) {
		if (err) {
			console.error(err);
		} else {
			console.log('Started on http://localhost:' + port + ', serving images for '+bambooHost);
		}
		if (callback) callback(err);
	});
}
