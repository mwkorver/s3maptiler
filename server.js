#!/usr/local/bin/node
console.log('Starting S3 Tiler');

// dependencies
var AWS = require('aws-sdk'),
    url = require('url'),
    fs = require('fs'),
    http = require('http'),
    os = require('os'),
	domain = require('domain');
	d = domain.create();


d.on('error', function(err) {
	console.error('ERROR: '+ err);
	res.writeHead(500, {'Content-Type': 'text/plain'});
	res.write('ERROR: '+ err);
	res.end();
});

// for local testing, if mac, change to win32 to darwin.
if (os.platform() == 'win32'){
	// load environment vars from local file
	var env = require('./env.js');
	// get keys here, do not put config.json in ver control. Add to gitignore
	AWS.config.loadFromPath('./config.json');
} 	
// load from EB's environment vars
// This is the S3 bucket that serves TMS requests. 
// It needs to be setup as a website and have a redirect rule
// pointed at this application
console.log('S3 Bucket: ' + process.env.BUCKET_NAME);
console.log('Tile Prefix: ' + process.env.TILE_PREFIX);  
// Server name, typically an ELB in front of WMS servers 
// if necessary should include the map file path
// http://yournamehere-1977199279.us-east-1.elb.amazonaws.com/cgi-bin/mapserv?map=/data/map/mapfiles/mapfilename.map&
console.log('WMS Server: ' + process.env.WMS_SERVER);
// WMS request map layers
console.log('Map Layer: ' + process.env.MAP_LAYERS);

var port = process.env.PORT || 9999

var mimeTypes = {
    "jpg": "image/jpeg",
    "tif": "image/tif",
    "png": "image/png"};   

// include Klokan TMS functions:
eval(fs.readFileSync('globalMercator.js')+'');
var mercator = MercatorUtils();

//this function builds WMS request from a TMS tile name.
function getTileUrl(level, row, col, imagetype) {
	var mercBounds = mercator.tileBounds(row, col, level);
	wmsreq = process.env.WMS_SERVER + "&SERVICE=WMS&LAYERS=" + process.env.MAP_LAYERS
	+ "&SRS=epsg:3857&BBOX=" 
	+ mercBounds[1] + "," + mercBounds[0] + "," + mercBounds[3] + "," + mercBounds[2] 
	+ "&VERSION=1.1.1&REQUEST=GetMap&FORMAT=" 
	+ imagetype
	+ "&WIDTH=256&HEIGHT=256";
	return (wmsreq);
	}

d.run(function() {
	http.createServer(function (req, res) {
		console.log('--------------------------------');
		var test = false;

		// Controls for favicon request from browsers
		if (req.url === '/favicon.ico') {
			res.writeHead(200, {'Content-Type': 'image/x-icon'} );
			res.end();
			console.log('favicon requested');
			return;
		}
		// Heartbeat response for ELB
		if (req.url === '/heartbeat' || req.url ==='/') {
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.write('Success');
			res.end();
			console.log('Heartbeat requested');
			return;
		}
		
		var queryObject = url.parse(req.url,true).query;
	    console.log('queryObject: ' + JSON.stringify(queryObject, null, 4));

		// checks to see if tile object and debug param test exists
		// if no tile name uses built-in tile name and sets to debug mode
		if (typeof queryObject.tile !== 'undefined'){
			var tilename = queryObject.tile;
			if (typeof queryObject.test !== 'undefined'){
				console.log('check for test: ' + queryObject.test);
				test = true;				
			}
		// If no tile query put into test mode	
		} else {
			test = true;
			console.log('No tile query object, putting in test mode');
			tilename = process.env.TILE_PREFIX + "17/20996/85306.jpg"; // utm10 seattle
			//tilename = process.env.TILE_PREFIX + "14/4958/6060.jpg"; // boston
			//tilename = process.env.TILE_PREFIX + "14/3887/10128.jpg"; // kansas city
			console.log('no url value, using builtin test tilename: ' + tilename);				
		} 

		try {
		// parses the url
			var level = tilename.split('/').slice(2)[0], 
				col = tilename.split('/').slice(3)[0],
				tmp = tilename.split('/').slice(4)[0],
				row = parseInt(tmp.split('.').slice(0)[0]),
				ext = tilename.split('.').pop();
	  	} catch (e) {
		    res.writeHead(500, {'Content-Type': 'text/plain'});
		    res.write('Error parsing url\n');
		    console.log('Error parsing url:' + e)
		    res.end();
			return;
		}
		
		// Infer the image type.
		var typeMatch = tilename.match(/\.([^.]*)$/);
		if (!typeMatch) {
			console.error('unable to infer image type for key ' + tilename);
			res.writeHead(400, {'Content-Type': 'text/plain'} );
			res.write('unable to infer image type from object key\n');
			res.end();
			return;
		}
		var imageType = typeMatch[1];
		if (imageType != "jpg" && imageType != "png") {
			console.error('skipping non-image ' + tilename);
			res.writeHead(400, {'Content-Type': 'text/plain'} );
			res.write('Error, non-image request\n');
			res.end();
			return;
		}

		// create the WMS url
		var wmsrequest = getTileUrl(level, row, col, mimeTypes[tilename.split(".").reverse()[0]]);
	   	
	   	// if in test mode, output debug info	
		if (test) {
	  		res.writeHead(200, {'Content-Type': 'text/html'});
			res.write('<html><body>');
			res.write('Tilename:<br>' + tilename + '<br>');
			res.write('S3 Bucket:<br>' + process.env.BUCKET_NAME + '<br>');
			res.write('WMS Request:<br>' + wmsrequest + '<br>');
			res.write('Resulting Image Tile:<br>');
			res.write('<img src="' + wmsrequest + '">');
			res.write('</body></html>');						
	  		res.end();
		} else {
			// buffer rather than pipe it to the response
			// these are small files, plus we can check to see if it is an image
			var buf = new Buffer(256*256)
			http.get(wmsrequest, function(resp) {
				var size = 0
				resp.on('data', function(chunk) {
					chunk.copy(buf, size)
					size += chunk.length
				})
				.on('end', function() {
					// add check for image data here
					res.writeHead(200, {'Content-Type': mimeTypes[tilename.split(".").reverse()[0]]});
					res.write(buf.slice(0, size))
					res.end();
					// get reference to S3 client 
					var s3 = new AWS.S3();
					// upload to S3
					s3.putObject({
						Bucket: process.env.BUCKET_NAME, 
						Key: tilename,
						ACL: 'public-read',	
						Body: buf.slice(0, size), 
						ContentType: mimeTypes[tilename.split(".").reverse()[0]]}, function(err, s3put){
						//if (err) throw err;
						console.log('s3put: ' + JSON.stringify(s3put, null, 2));
					});
				})
			})

		}
	}).listen(port);
	console.log('running on port: ' + port);
}); //domain





