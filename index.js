var verify = require('check-types').verify;
var q = require('q');
var moment = require('moment');

var email, password;

(function getEmailAndPassword() {
  console.log('getting email and password from environment');
  email = process.env.GRAVATAR_EMAIL;
  password = process.env.GRAVATAR_PASSWORD;
}());

verify.unemptyString(email, 'missing email');
console.log('using gravatar email', email);
verify.unemptyString(password, 'missing password');

var gravatar = require('set-gravatar')(email, password);
verify.object(gravatar, 'got gravatar api object for ' + email);

function getImageIdFromStatus(status) {
  verify.number(status, 'expecting status number, got ' + status);
  if (status < 0 || status > 100) {
    throw new Error('invalid percent status ' + status);
  }
  if (status < 50) {
    return '4c685643d2f7dce36c63f1fc62748a60';
  } else if (status < 75) {
    return '0fd1ef2b64f760afb5e3dc66db8b231c';
  } else if (status < 90) {
    return '4982ff0079347587d5d4698076cbe5a0';
  } else {
    // everything is perfect
    return 'f44fea071b9f570e66f339a121f10230';
  }
}

function now() {
  return moment().format('YYYY-MM-DD h:mm:ss a');
}

// resolved with percent value 0 - 100
// 0 - everything is broken
// 100 - everything is perfect
function checkStatus() {
  var defer = q.defer();
  process.nextTick(function () {
    var dice = Math.random() * 100;
    dice = dice.toFixed(0);
    console.log('project status', dice + '%');
    defer.resolve(+dice);
  });
  return defer.promise;
}

function runLoop(addresses, interval) {
  verify.array(addresses, 'expected addresses array');
  console.log('have', addresses.length, 'email address(es)');
  if (addresses.length < 1) {
    throw new Error('empty list of addresses for email ' + email);
  }
  if (interval < 1000) {
    throw new Error('interval in ms should be longer than 1 second, probably 1 hour is best');
  }

  var previousImage;
  var workerInterval = setInterval(function checkAndSet() {
    console.log('checking and setting');

    checkStatus()
    .then(function (status) {
      var image = getImageIdFromStatus(status);
      verify.unemptyString(image, 'could not image id for status ' + status);
      console.log(now(), 'status', status, 'image id', image);
      if (previousImage === image) {
        console.log('nothing has changed, keeping same image');
        return;
      }
      gravatar.useUserimage(image, addresses, function (err, results) {
        if (err) throw err;
        console.log('set image', image, 'as public gravatar, results', results);
      });
    })
    .fail(function (err) {
      console.error('error', err);
    });
  }, interval);
}

gravatar.addresses(function (err, addresses) {
  if (err) throw err;
  var interval = 5; // seconds
  runLoop(Object.keys(addresses), interval * 1000);
});
