const os = require('os');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
var ws = require("nodejs-websocket");
var exec = require('child_process').exec;
//var wlan = require('./wlan')();
var wlan = require("wlan");
var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;

module.exports = Sonoff;

function Sonoff() {
 //create a new Sonoff object if it does not exist
 if (!(this instanceof Sonoff))
  return new Sonoff();
 //call the super constructor to initialize `this`
 emitter.call(this);
}

//Sonoff class extends emitter
inherits(Sonoff, emitter);

Sonoff.prototype.init = function init() {
 var self = this;
 self._initialized = false;
 self._connected = false;
 self._knownDevices = [];
    
 self._inithttps(self);
};

Sonoff.prototype.pair = function (force, ssid, pwd) {
 var self = this;
 var apSSID = "ITEAD-10000";
 var find = setInterval(() => {
   if (!self._initialized) {
    console.log('Waiting for initialization.');
    return; //wait for init
   }
   wlan.Discover().then(nets => {
    var apNet = nets.find(n => n.ssid.startsWith(apSSID));
    if (!apNet) {
     console.log('ERR | Sonoff is not in pairing mode. Please, Long press until led start blinking fast.');
    } else {
     console.log('OK | Sonoff found in pairing mode.');
     //apSSID = apNet.ssid;
     clearInterval(find);
     if (self._nic.ssid != apNet.ssid) {
      wlan.Connect(apNet, '12345678').then(() => {
       wlan.getNic().then(n => {
        var nic = null;
        if (n.length >= 1) {
         //get only first
         nic = n[0];
        } else {
         console.log('ERR | No WLAN interfaces found. Unable to process.');
         return;
        }
        if (nic.ssid != apNet.ssid) {
         console.log('ERR | Unable to connect to the configuration AP.');
         return;
        } else {
                                    _initDevice(self, nic, self._nic.ssid, self._nic.key, force);
        }
       });
      });
     } else {
      console.log('ERR | You should not be connected to Sonoff configuration AP to pair device.');
     }
    }
   });
  }, 3000);
};

Sonoff.prototype.powerState = function (device, state) {
 var self = this;
    return new Promise(function(resolve, reject) {
    var d = self._knownDevices.find(d=>d.id === device.id);
    if(!d) {
        reject('Sonoff device '+device.kind+' not found');
     } else {  
  if(self._connected) {
   var h = f => {
    if(f.device.id == d.id){
     self.removeListener('msg',h);
     if(!f.err) resolve(f.device);
     else reject(f.err);
    }
   };
   self.on('msg', h);
   self.emit('push', {action: 'update', value: {switch : state?'on':'off'}, target: d.id});
  }
  }
 });
};

Sonoff.prototype.setTimer = function(device, time, state){
 var self = this;
var d = self._knownDevices.find(d=>d.id === device.id);
    if(!d) {
        console.log('Sonoff device '+device.kind+' not found');
     } else {  
  if(self._connected) {
   d.timers = d.timers || [];
   d.timers.push({
    enabled : true,
    type : time.includes('T')?'once':'repeat',
    at : time,
    do : {
     switch : state?'on':'off'
    }
   });
   self.emit('push', {action: 'update', value: {timers : d.timers}, target: d.id});
  }
  }
}

var _initDevice = (self, nic, ssid, pwd, force) => {
 exec("route change 0.0.0.0 mask 0.0.0.0 10.10.7.1", function (err, res) {
  if (err) {
   console.log('ERR | unable to set AP network: ', err);
   reject(err);
  } else {
            console.log('OK | '+res);
   http.get('http://10.10.7.1/device', (res) => {
    const sc = res.statusCode;
    const ct = res.headers['content-type'];
    if (sc !== 200) {
     console.log('Unable to connect to the target device. Code: ' + sc);
     res.resume();
     return;
    }
    res.setEncoding('utf8');
    var data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
     var response = JSON.parse(data);
     var device = {
      deviceid: response.deviceid,
      apikey : response.apikey
     };
     self._httpPost('http://10.10.7.1/ap', {
      "version": 4,
      "ssid": self._nic.ssid,
      "password": self._nic.key,
      "serverName": self._ip,
      "port": self._port
     }, (re, err) => {
      if (err) {
       console.log('Unable to configure endpoint ' + err);
      } else {
       console.log(JSON.stringify(re));
      }
     });
    });
}).on('error', (e) => {
    console.log(`Unable to establish connection to the device: ${e.message}`);
   });
  }
 });
};

Sonoff.prototype._initServer = (self) => {
 wlan.getNic().then(n => {
  self._nic = n[0];
  var ifaces = os.networkInterfaces();
  for (var i in ifaces) {
   for (var k in ifaces[i]) {
    var address = ifaces[i][k];
    if (address.family === 'IPv4' && !address.internal && address.mac == self._nic.mac) {
     self._ip = address.address;
     self._port = 80;
//create server
     http.createServer((req, res) => {
      res.writeHead(200, {
       'Content-Type': 'application/json'
      });
      res.end();
     }).listen(self._port, self._ip, () => {
      self._initialized = true;
     });
break;
    }
   }
  }
 });
};

Sonoff.prototype._initws = (self, ip, port)=>{
    var options = {
        secure : true,
        key: fs.readFileSync('./tools/ipsum-key.pem'),
        cert: fs.readFileSync('./tools/ipsum-cert.pem'),
    };
    var server = ws.createServer(options,function (conn) {
        console.log("WS | Server is up %s:%s to %s:%s",ip,port,conn.socket.remoteAddress,conn.socket.remotePort);
  self._connected = true;
  self.on('push',a=>{
   var rq = {
    "apikey" : "111111111-1111-1111-1111-111111111111",
    "action" : a.action,
    "deviceid" : a.target,
    "params" : a.value
   };
   var r = JSON.stringify(rq);
   console.log('REQ | WS | APP | ' + r);
            conn.sendText(r);
  });
        conn.on("text", function (str) {
            var data = JSON.parse(str);
            console.log('REQ | WS | DEV | %s', JSON.stringify(data));
            res = {
                "error" : 0,
                "deviceid" : data.deviceid,
                "apikey" : "111111111-1111-1111-1111-111111111111"
            };
   if(data.action) {
            switch(data.action){
                case 'date': 
                    res.date = new Date().toISOString();
                break;
                case 'query': 
    //device wants information
    var device = self._knownDevices.find(d=>d.id == data.deviceid);
     if(!device) {
      console.log('ERR | WS | Unknown device ',data.deviceid);
     } else {
      /*if(data.params.includes('timers')){
       console.log('INFO | WS | Device %s asks for timers',device.id);
       if(device.timers){
        res.params = [{timers : device.timers}];
       }
      }*/
      res.params = {};
      data.params.forEach(p=>{
       res.params[p] = device[p];
      });
     }
                break;
                case 'update': 
     //device wants to update its state
     var device = self._knownDevices.find(d=>d.id == data.deviceid);
     if(!device) {
      console.log('ERR | WS | Unknown device ',data.deviceid);
     } else {
      device.state = data.params.switch;
      self._updateKnownDevice(self,device);
     }
                break;
                case 'register':
     var device = {
      id : data.deviceid
     };
     var type = data.deviceid.substr(0, 2);
     if(type == '01') device.kind = 'switch';
     else if(type == '02') device.kind = 'light';
     else if(type == '03') device.kind = 'sensor'; //temperature and humidity. No timers here;
     device.version = data.romVersion;
     device.model = data.model;
     self._updateKnownDevice(self,device);
     console.log('INFO | WS | Device %s registered', device.id);
                break;
                default: console.log('TODO | Unknown action "%s"',data.action); break;
            }
   } else {
    console.log('TODO | WS | Not data action frame');
   }
   var r = JSON.stringify(res);
   console.log('RES | WS | DEV | ' + r);
            conn.sendText(r);
   var td = self._knownDevices.find(d=>d.id == res.deviceid);
   self.emit('msg',{device : td});
        });
        conn.on("close", function (code, reason) {
            console.log("Connection closed");
        });
    }).listen(port,ip);
};

Sonoff.prototype._inithttps = (self)=>{
    wlan.getNic().then(n => {
  self._nic = n[0];
  var ifaces = os.networkInterfaces();
  for (var i in ifaces) {
   for (var k in ifaces[i]) {
    var address = ifaces[i][k];
    if (address.family === 'IPv4' && !address.internal && address.mac == self._nic.mac) {
     self._ip = address.address;
     self._port = 80;
                    self._initws(self,self._ip,self._port + 1);
                        const options = {
                            key: fs.readFileSync('./tools/ipsum-key.pem'),
                            cert: fs.readFileSync('./tools/ipsum-cert.pem'),
                        };
                    var server = https.createServer(options, (req, res) => {
                    console.log('REQ | %s | %s ',req.method, req.url);
                    var body = [];
                    req.on('data', function(chunk) {
                    body.push(chunk);
                    }).on('end', function() {
                    body = JSON.parse(Buffer.concat(body).toString('utf-8'));
                    console.log('REQ | %s',JSON.stringify(body));
res.writeHead(200);
                         res.end(JSON.stringify({
                        "error": 0,
                        "reason": "ok",
                        "IP": self._ip,
                        "port": self._port + 1
                        }));
                    });
                
    }).listen(self._port,self._ip);
    server.on('connection', c=>{
     console.log("Connection: %s:%s",c.remoteAddress, c.remotePort);
    });
                break;
    }
   }
  }
 });
};

Sonoff.prototype._httpPost = (target, data, callback) => {
 var dta = JSON.stringify(data);
 var u = url.parse(target);
 var options = {
  hostname: u.hostname,
  port: u.port || 80,
  path: u.path,
  method: 'POST',
  headers: {
   'Content-Type': 'application/json',
   'Content-Length': Buffer.byteLength(dta)
  }
 };
    console.log('REQ | Sending %s to %s:%s%s',dta,options.hostname, options.port, options.path);
 var req = http.request(options, (res) => {
   var d = '';
   res.on('data', (c) => d += c);
   res.on('end', () => {
    var response = JSON.parse(d);
    callback(response);
   });
  }).on('error', (e) => {
   console.log(`unable to post request: ${e.message}`);
   callback(null, e);
  });
    req.write(dta);
 req.end();
};

Sonoff.prototype._updateKnownDevice = (self, device) => {
 var updated = false;
 for (var i = 0; i < self._knownDevices.length; i++) {
  if (self._knownDevices[i].id == device.id) {
   self._knownDevices[i] = device;
   updated = true;
   self.emit('deviceUpdated',device);
  }
 }
 if (!updated) {
  self._knownDevices.push(device);
  self.emit('deviceAdded',device);
 }
};
