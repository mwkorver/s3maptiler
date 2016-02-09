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
    findRemoveSync = require('find-remove');

    // get keys here, do not put this in ver control.
	//AWS.config.loadFromPath('./config.json'); 

// this is the underlying ELB where WMS servers live
var wmsServer = 'http://mapserv-1977199279.us-east-1.elb.amazonaws.com/wms/?map=/data/map/mapfiles/naip_rgb100pct_20140623.map&';
// this bucket is setup as website, also some levels have 1 day lifecycle.
var bucketname = "naip-tms";  

 var mimeTypes = {
    "html": "text/html",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png"};   

http.createServer(function (req, res) {
	console.log('-------------------------------------------');
	var pathObject = url.parse(req.url,true).path;
	console.log('pathObject: ' + pathObject);
	var queryObject = url.parse(req.url,true).query;
    console.log('queryObject: ' + queryObject);

	var test = false,
	testtilename = "17/20996/85306.jpg"; // utm10 seattle
	//testtilename = "14/4958/6060.jpg"; // boston
	//testtilename = "14/3887/10128.jpg"; // kansas city

	// checks to see if tile object and debug param test exists
	// if no tile name uses built-in tile name and put in debug mode
	if (typeof queryObject.tile !== 'undefined'){
		tilename = queryObject.tile;
		console.log('tilename in if block: ' + tilename);
		if (typeof queryObject.test !== 'undefined'){
			test = true;				
		}
	} else {
		console.log('Test mode');
		test = true;
		tilename = '1.0.0/tms-mercator-naip/' + testtilename;
		console.log('no url value, using builtin test tilename: ' + tilename);				
	} 

	// add a prefix to tilename to write to diff part of targe bucket for testing
	if(test){tilename = 'test-' + tilename};
	console.log('tilename: ' + tilename);

	// parses the url
	var level = tilename.split('/').slice(2)[0], 
		col = tilename.split('/').slice(3)[0],
		tmp = tilename.split('/').slice(4)[0],
		row = parseInt(tmp.split('.').slice(0)[0]),
		ext = tilename.split('.').pop(),
		localfilepath = './tmp/' + level + '-' + col + '-' + row + '.' + ext;

	console.log('localfilepath: ' + localfilepath);

	// include Klokan TMS functions:
	eval(fs.readFileSync('globalMercator.js')+'');

  	var mercator = MercatorUtils();

	//this function builds WMS request from tile name.
	function getTileUrl(level, row, col) {
		var mercBounds = mercator.tileBounds(row, col, level);
		wmsreq = wmsServer + "&SERVICE=WMS&LAYERS=utm11-100pct&SRS=epsg:3857&BBOX=" 
		+ mercBounds[1] + "," + mercBounds[0] + "," + mercBounds[3] + "," + mercBounds[2] 
		+ "&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/jpeg&WIDTH=256&HEIGHT=256";
		return (wmsreq);
  	}

	// get reference to S3 client 
	var s3 = new AWS.S3();

	// Infer the image type.
	var typeMatch = tilename.match(/\.([^.]*)$/);
	if (!typeMatch) {
		console.error('unable to infer image type for key ' + srcKey);
		return;
	}
	var imageType = typeMatch[1];
	if (imageType != "jpg" && imageType != "png") {
		console.log('skipping non-image ' + srcKey);
		return;
	}

	// need to do this async, get the data via wms req first, then write data
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
				console.log('localfile exists');
								
				    if (test) {
				    	var starttime = new Date().getTime();
				 		res.writeHead(200);
						res.write('<html><body>');
						res.write('tilename:<br>' + tilename + '<br>');
						res.write('WMS request:<br>' + wmsrequest + '<br>');
						res.write('Resulting tile:<br>');
						res.write('<img src="' + wmsrequest + '">');
						res.write('</body></html');						
				  		res.end();
					} else {
						// upload image to S3		
						var params = {Bucket: bucketname, 
							Key: tilename,
							//ACL: 'private | public-read | public-read-write | authenticated-read | bucket-owner-read | bucket-owner-full-control',
							ACL: 'public-read',
							ContentType: mimeTypes[path.extname(localfilepath).split(".").reverse()[0]], 
							//RequestPayer: 'requester',
							//Body: new Buffer('...') || 'STRING_VALUE' || streamObject,
							Body: fs.createReadStream(localfilepath) 
							//CacheControl: 'STRING_VALUE',
						};

						s3.putObject(params, function(err, data) {
							if (err) console.log(err, err.stack); 
							else console.log('s3 put data: ' + data);
						});

						//write image data to HTTP response
					    res.writeHead(200, {'Content-Type': 
							mimeTypes[path.extname(localfilepath).split(".").reverse()[0]]
						} );
					    fs.createReadStream(localfilepath).pipe(res);
					}
			  	} catch (e) {
				    res.writeHead(404, {'Content-Type': 'text/plain'});
				    res.write('404 Not Found\n');
				    res.write('error:' + e);
				    console.log('error:' + e)
				    res.end();
			    return;
		  		}
		  		//callback(null);
			}
		], function(err) {
			if (err) {
				console.error(
					'Unable to upload tile to: ' + bucketname + '/' + tilename +
					' due to an error: ' + err
				);
			} else {
				console.log(
					'Successfully uploaded to ' + bucketname + '/' + tilename
				);
			}
		}
	);

	console.log('immediatlely before findRemove');
	var result = findRemoveSync('./tmp', {age: {seconds: 30}, extensions: '.jpg'});
	console.log('findRemove result: ' + result);

//}).listen(8080);
}).listen(process.env.PORT || 8888);





