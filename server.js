#!/usr/local/bin/node
console.log('Starting S3 Tiler');

// dependencies
var http = require('http'),
	async = require('async'),
 	AWS = require('aws-sdk'),
	fs = require('fs'),
	path = require('path'),
    request = require('request').defaults({ encoding: null }),
    url = require('url'),
    os = require('os');
  
    //findRemoveSync = require('find-remove');

// for local testing, if mac, change to darwin.
if (os.platform() == 'win32'){
	// load environment vars from local file
	var env = require('./env.js');
	// get keys here, do not put config.json in ver control. Add to gitignore
	AWS.config.loadFromPath('./config.json');
} else {
	// load from EB's environment vars
	// This is the S3 bucket that serves TMS requests. 
	// It needs to be setup as a website and have a redirect rule
	// pointed at this application
	var bucketName = process.env.BUCKET_NAME; 
	// Server name, typically an ELB in front of WMS servers 
	// if necessary should include the map file path
	// http://yournamehere-1977199279.us-east-1.elb.amazonaws.com/cgi-bin/mapserv?map=/data/map/mapfiles/mapfilename.map&
	var wmsServer = process.env.WMS_SERVER;
	// WMS request map layers
	var mapLayers = process.env.MAP_LAYERS;
}

console.log('S3 Bucket: ' + process.env.BUCKET_NAME);
console.log('WMS Server: ' + process.env.WMS_SERVER);
console.log('Map Layer: ' + process.env.MAP_LAYERS);

var port = process.env.PORT || 8888

var mimeTypes = {
    "html": "text/html",
    "jpg": "image/jpeg",
    "tif": "image/tif",
    "png": "image/png"};   

http.createServer(function (req, res) {
	console.log('-------------------------------------------');

	// control for favicon request from browsers
	if (req.url === '/favicon.ico') {
		res.writeHead(200, {'Content-Type': 'image/x-icon'} );
		res.end();
		console.log('favicon requested');
		return;
	}
	
	var pathObject = url.parse(req.url,true).path;
	console.log('pathObject: ' + pathObject);
	var queryObject = url.parse(req.url,true).query;
    console.log('queryObject: ' + queryObject);

	var test = false,
	// a few geographically dispersed tile names for testing
	testtilename = "17/20996/85306.jpg"; // utm10 seattle
	//testtilename = "14/4958/6060.jpg"; // boston
	//testtilename = "14/3887/10128.jpg"; // kansas city

	// checks to see if tile object and debug param test exists
	// if no tile name uses built-in tile name and sets to debug mode
	if (typeof queryObject.tile !== 'undefined'){
		tilename = queryObject.tile;
		console.log('tilename in if block: ' + tilename);
		if (typeof queryObject.test !== 'undefined'){
			console.log('check for test: ' + queryObject.test);
			test = true;				
		}
	} else {
		test = true;
		console.log('No tile query object, putting in test mode');
		tilename = '1.0.0/tms-mercator-naip/' + testtilename;
		console.log('no url value, using builtin test tilename: ' + tilename);				
	} 

	try{
	// parses the url
		var level = tilename.split('/').slice(2)[0], 
			col = tilename.split('/').slice(3)[0],
			tmp = tilename.split('/').slice(4)[0],
			row = parseInt(tmp.split('.').slice(0)[0]),
			ext = tilename.split('.').pop(),
			// local file name for writing to disk
			localfilepath = './tmp/' + level + '-' + col + '-' + row + '.' + ext;

  	} catch (e) {
	    res.writeHead(500, {'Content-Type': 'text/plain'});
	    res.write('Server error\n');
	    console.log('Error parsing url:' + e)
	    res.end();
		return;
	}


	console.log('localfilepath: ' + localfilepath);

	// include Klokan TMS functions:
	eval(fs.readFileSync('globalMercator.js')+'');
  	var mercator = MercatorUtils();

	//this function builds WMS request from a TMS tile name.
	function getTileUrl(level, row, col) {
		var mercBounds = mercator.tileBounds(row, col, level);
		wmsreq = process.env.WMS_SERVER + "&SERVICE=WMS&LAYERS=" + process.env.MAP_LAYERS
		+  "&SRS=epsg:3857&BBOX=" 
		+ mercBounds[1] + "," + mercBounds[0] + "," + mercBounds[3] + "," + mercBounds[2] 
		+ "&VERSION=1.1.1&REQUEST=GetMap&FORMAT=" 
		+ mimeTypes[path.extname(localfilepath).split(".").reverse()[0]]
		+ "&WIDTH=256&HEIGHT=256";
		return (wmsreq);
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


	// get image via wms req first, then write data back and put to S3
	async.waterfall([
		function geturl(next){	
			//builds wms request url
			wmsrequest = getTileUrl(level, row, col);
			next(null, wmsrequest)
		},
		//function download(next) {
		function download(wmsrequest,next){
			//builds wms request url
			//var wmsrequest = getTileUrl(level, row, col);
			var r = request(wmsrequest).pipe(fs.createWriteStream(localfilepath));
				r.on('close', next);
			//s3.getObject({Bucket: srcBucket,Key: srcKey},next);
		},
		function upload(next) {    		
			try {
				//check to see if file exists
		    	stats = fs.lstatSync(localfilepath); // throws if path doesn't exist
								
				    if (test) {
				    	var starttime = new Date().getTime();
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
						// upload image to S3		
						var params = {Bucket: process.env.BUCKET_NAME, 
							Key: tilename,
							ACL: 'public-read',
							ContentType: mimeTypes[path.extname(localfilepath).split(".").reverse()[0]], 
							//Body: new Buffer('...') || 'STRING_VALUE' || streamObject,
							Body: fs.createReadStream(localfilepath) 
							//CacheControl: 'STRING_VALUE',
						};

						// get reference to S3 client 
						var s3 = new AWS.S3();

						s3.putObject(params, function(err, data) {
							if (err) console.log('Error uploading to S3: ' + err);
							else console.log('Uploaded tile to S3');
						});

						//write image data to HTTP response
					    res.writeHead(200, {'Content-Type': 
							mimeTypes[path.extname(localfilepath).split(".").reverse()[0]]
						} );
					    fs.createReadStream(localfilepath).pipe(res);
					}
			  	} catch (e) {
				    res.writeHead(500, {'Content-Type': 'text/plain'});
				    res.write('Server error\n');
				    console.log('error:' + e)
				    res.end();
			    return;
		  		}
		  		//callback(null);
			}
		], function(err) {
			if (err) {
				console.error(
					'Unable to upload tile to: ' + bucketName + '/' + tilename );
			} 
		}
	);

	//console.log('immediatlely before findRemove');
	//var result = findRemoveSync('./tmp', {age: {seconds: 30}, extensions: '.jpg'});
	//console.log('findRemove result: ' + result);

}).listen(port);
console.log('running on port: ' + port);





