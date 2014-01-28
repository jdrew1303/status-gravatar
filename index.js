require('autostrip-json-comments');
var verify = require('check-types').verify;
var q = require('q');
var moment = require('moment');
var Table = require('easy-table');
var S = require('string');

var updateNotifier = require('update-notifier');
var notifier = updateNotifier();
if (notifier.update) {
  notifier.notify();
}

function initUserInfo() {
  var email, password, username;
  var config = require('./config.json');

  if (!config.email || config.email === 'GRAVATAR_EMAIL') {
    console.log('getting Gravatar email from environment');
    email = process.env.GRAVATAR_EMAIL;
  } else {
    email = config.email;
  }

  if (!config.password || config.password === 'GRAVATAR_PASSWORD') {
    console.log('getting Gravatar password from environment');
    password = process.env.GRAVATAR_PASSWORD;
  } else {
    password = config.password;
  }

  if (!config.username || config.username === 'GITHUB_USERNAME') {
    console.log('getting Github username from environment');
    username = process.env.GITHUB_USERNAME;
  } else {
    username = config.username;
  }
  return {
    email: email,
    password: password,
    username: username
  };
}

function initGravatarClient(email, password) {
  var gravatar = require('set-gravatar')(email, password);
  verify.object(gravatar, 'got gravatar api object for ' + email);
  return gravatar;
}

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

var Travis = require('travis-ci');
var travis = new Travis({
    version: '2.0.0'
});

function printRepos(repos) {
  verify.array(repos, 'expected array of repos');
  var t = new Table();
  repos.forEach(function (repo) {
    t.cell('slug', repo.slug);
    t.cell('status', repo.last_build_state);
    t.cell('description', S(repo.description).truncate(50).s);
    t.newRow();
  });
  console.log(t.toString());
}

function printUserImages(userimages) {
  verify.object(userimages, 'expected userimages object');
  var info = {};
  Object.keys(userimages).forEach(function (id) {
    var props = userimages[id];
    var url = props[1];
    verify.webUrl(url, 'could not get image url from ' + props);
    info[id] = url;
  });

  var t = new Table();

  console.log('user images:');
  Object.keys(info).forEach(function (id) {
    var url = info[id];
    t.cell('id', id);
    t.cell('url', url);
    t.newRow();
  });
  console.log(t.toString());
}

// resolved with percent value 0 - 100
// 0 - everything is broken
// 100 - everything is perfect
function checkStatus() {
  var defer = q.defer();

  travis.repos({
    owner_name: username
  }, function (err, results) {
    if (err) throw err;
    verify.object(results, 'missing results object');
    verify.array(results.repos, 'missing repos array in ' + JSON.stringify(results, null, 2));
    printRepos(results.repos);

    var good = 0;
    var errorRegexp = /fail|error/i;
    results.repos.forEach(function (repo) {
      if (!errorRegexp.test(repo.last_build_state)) {
        good += 1;
      }
    });
    var successful = results.repos.length ? good / results.repos.length : 0;
    successful *= 100;
    successful = successful.toFixed(0);
    console.log('for username', username, good, 'good projects from', results.repos.length);
    defer.resolve(+successful);
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

  function checkAndSet() {
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
  }

  var workerInterval = setInterval(checkAndSet, interval);
  // run first time
  checkAndSet();
}

function verifyUser(user) {
  verify.object(user, 'could not get user object');
  verify.unemptyString(user.email, 'missing email');
  verify.unemptyString(user.password, 'missing password');
  verify.unemptyString(user.username, 'missing github username');
}

function startApp() {
  var user = initUserInfo();
  verifyUser(user);
  console.log('using gravatar email', user.email);

  var gravatar = initGravatarClient(user.email, user.password);
  gravatar.addresses(function (err, addresses) {
    if (err) throw err;

    gravatar.userimages(function (err, userimages) {
      if (err) throw err;
      printUserImages(userimages);

      var interval = 3600; // seconds
      runLoop(Object.keys(addresses), interval * 1000);
    });
  });
}

require('pretty-error').start(startApp);
