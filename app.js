/*
Avil Creeggan Presents:
An Arduino node.js Location Poller
 =====================================================
For Tomorrowx3 on the occasion of the dedication
of his INTERNET SPACESHIP CONTROL AND LIGHTING PANEL
=====================================================
Based on my DOTLAN Follower at: https://www.reddit.com/r/Eve/comments/5gtw08/crest_dotlan_follower_by_avil_creeggan/?utm_content=title&utm_medium=user&utm_source=reddit&utm_name=frontpage
THIS CODE IS THE OPPOSITE OF BEING SECURE. USE AT YOUR OWN RISK.
=====================================================
License is unlimited, use / modify / distribute as you please.
WARNING: This is my first node.js project and I'm not a JS developer to start with.
Tread carefully through my shitty hack code.
*/

/*Static variables for OAuth2 and developer configuration*/
var redirectURI = "http://localhost:3000/callback"; //Where the client returns after their OAuth attempt.
var clientID = "06641c3c8cc049a58195929fcdfe4196"; // The CCP-assigned key for this application's OAuth attempts.
var developerSecret = "azUi3E5I1FWjeb3cCLNDuqYehZsFMBKrze3yWwyg"; // One of my developer secrets that shouldn't be distributed to the public... but whatever.
var basicAuth = new Buffer.from(clientID+":"+developerSecret).toString('base64');
var scopes = "characterLocationRead";
/*Working variables*/
/*Manage OAuth2 storage and refresh here*/
var longTermToken;
var shortTermToken;
var tokenIntervalObject;
/*Store long-term character information here*/
var characterID;
var characterName;
/*Store current system location and refresh here*/
var systemID;
var systemName;
var locationIntervalObject;

/*Long term storage of the longTermToken if available*/
var persistent = require('./longTermToken.json');

/*Start calling stuff*/
var request = require('request'); //Start the HTTP server
var fs = require('fs');
/*require('request-debug')(request); //DEBUG */

var oAuthRequest = request.defaults({
    headers: {
        'Authorization' : 'Basic '+ basicAuth,
        'User-Agent': 'avil-creeggan-arduino-nodejs-location-poller',
        'Content-Type': 'application/json',
        "Accept": "application/json, charset=utf-8"
    }
});

var CRESTRequest = request.defaults({
    headers: {
        'User-Agent': 'avil-creeggan-arduino-nodejs-location-poller',
        'Content-Type': 'application/json',
        "Accept": "application/json, charset=utf-8"
    }
});

var five = require('johnny-five'),
    board = new five.Board(),
    lcd;

board.on('ready', function() {
    lcd = new five.LCD({
        pins: [12, 11, 5, 4, 3, 2],
        rows: 2,
        cols: 16
    });

    this.repl.inject({
        lcd: lcd
    });
});

function reset() {
    console.log("RESET >> Clearing refresh (long-term) token from file and from persistent state...");
    fs.writeFile( "longTermToken.json", "{\"longTermToken\":\""+""+"\" }", "utf8");
    characterID = undefined;
    characterName = undefined;
    systemID = undefined;
    systemName = undefined;
    if (locationIntervalObject) clearInterval(locationIntervalObject);
    locationIntervalObject = undefined;
    longTermToken = undefined;
    shortTermToken = undefined;
    if (tokenIntervalObject) clearInterval(tokenIntervalObject);
    tokenIntervalObject = undefined;
}

function updateShortTermToken() {
    oAuthRequest.post('https://login.eveonline.com/oauth/token',
        { json: { "grant_type":"refresh_token","refresh_token":longTermToken } },
        function (err, httpResponse, body) {
            if (err) {
                reset();
                return console.error('updateShortTermToken() - Authentication failed:',err);
            }
            if (!body.refresh_token) {
                reset();
                return console.error('updateShortTermToken() - Bad JSON data:',body);
            }
            shortTermToken = body.access_token;
            CRESTRequest = CRESTRequest.defaults({
                headers: {
                    'Authorization' : 'Bearer '+ shortTermToken,
                    'User-Agent': 'avil-creeggan-arduino-nodejs-location-poller',
                    'Content-Type': 'application/json',
                    "Accept": "application/json, charset=utf-8"
                }
            });
            console.log("AUTH >> Received access token on subsequent authorization.");
            if (tokenIntervalObject) clearInterval(tokenIntervalObject);
            tokenIntervalObject = setInterval(function() { updateShortTermToken() }, (body.expires_in*1000) - 5000);
        }
    );
}

function updateCharacterIdentity() {
    CRESTRequest.get('https://login.eveonline.com/oauth/verify',
        function (err, httpResponse, body) {
            if (err) {
                reset();
                return console.error('updateCharacterIdentity() - Authentication failed:',err);
            }
            var json = JSON.parse(body);
            if (!json.CharacterID) {
                return console.error('updateCharacterIdentity() - Bad JSON data:',body);
            }
            characterID = json.CharacterID;
            characterName = json.CharacterName;
            updateCharacterLocation();
        }
    );
}

function updateCharacterLocation() {
    CRESTRequest.get('https://crest-tq.eveonline.com/characters/' + characterID + '/location/',
        function (err, httpResponse, body) {
/*            console.log(err);*/
            if (err) {
                reset();
                return console.error('updateCharacterLocation() - Authentication failed:',err);
            }
            var json = JSON.parse(body);
            if  (json.solarSystem == undefined) {
                if (systemName != "Logged out") {
                    systemID = undefined;
                    systemName = "Logged out";
                    console.log("LOCATION >>> System is now: " + systemName);
                    updateDisplay();
                }
            }
            else if (json.solarSystem.name != systemName) {
                systemID = json.solarSystem.id_str;
                systemName = json.solarSystem.name;
                console.log("LOCATION >>> System is now: " + systemName);
                updateDisplay();
            }
            if (!locationIntervalObject) locationIntervalObject = setInterval(function() { updateCharacterLocation(); },5000);
        }
    );
}

function updateDisplay() {
    console.log('=== \nIF JOHNNY FIVE WERE IMPLEMENTED HERE, RIGHT AROUND NOW THE LCD WOULD READ:\n' +
        '================\n' +
        characterName + '\n' +
        systemName  + '\n' +
        '================');
    //Comment the above out using /* */ once it's working.
    if (lcd != undefined) {
        lcd.clear();
        lcd.cursor(0, 0).print(characterName);
        lcd.cursor(1, 0).print(systemName);
    }
    else {
        console.log("LCD >> Not yet ready to print update. Navigate to http://localhost:3000/ to view current data.")
    }
}

var express = require('express'),
    app = express();

app.listen(3000, function () {
    if (persistent.longTermToken) {
        longTermToken = persistent.longTermToken;
        console.log(">> AUTH: Successfully loaded existing long term token from storage. Restoring state...");
        updateShortTermToken();
        setTimeout(function () { updateCharacterIdentity(); }, 2000);
    }
    else {
        console.log('Monitor active on port 3000. Please navigate to http://localhost:3000/ to log in for the first time.');
    }
});

app.get('/', function (req, res) {
    if (!longTermToken) res.redirect('/evesso');
    else  {
        res.send('<meta http-equiv="refresh" content="5; URL=http://localhost:3000/">'+
                '<p><b>CharName:</b> '+characterName+'</p>\n'+
                '<p><b>CharID:</b> '+characterID+'</p>\n'+
                '<p><b>SystemName:</b> '+systemName+'</p>\n'+
                '<p><b>SystemID:</b> '+systemID+'</p>');
        if (!locationIntervalObject) locationIntervalObject = setInterval(function() { updateCharacterLocation(); },5000);
    }
});

app.get('/callback', function (req, res) {
    if (req.query.code) {
        reset();
/*        console.log("Received Authentication Code. Requesting refresh token from authentication_code: " + req.query.code);*/
        oAuthRequest.post('https://login.eveonline.com/oauth/token',
            {json: {"grant_type": "authorization_code", "code": req.query.code}},
            function (err, httpResponse, body) {
                if (err) {
                    return console.error('/callback - Authentication failed:', err);
                }
/*                console.log(body);*/
                if (!body.refresh_token) {
                    return console.error('/callback - Bad JSON data:', body);
                }
                longTermToken = body.refresh_token;
                shortTermToken = body.access_token;
                CRESTRequest = CRESTRequest.defaults({
                    headers: {
                        'Authorization': 'Bearer ' + shortTermToken,
                        'User-Agent': 'avil-creeggan-arduino-nodejs-location-poller',
                        'Content-Type': 'application/json',
                        "Accept": "application/json, charset=utf-8"
                    }
                });
                console.log("AUTH >> Received valid refresh and access token on initial authorization. Now polling identity and location...");
                updateCharacterIdentity();
                if (tokenIntervalObject) clearInterval(tokenIntervalObject);
                tokenIntervalObject = setInterval(function() { updateShortTermToken() }, (body.expires_in*1000) - 5000);
                console.log("AUTH >> Writing refresh (long-term) token to file for persistent state...");
                fs.writeFile( "longTermToken.json", "{\"longTermToken\":\""+longTermToken+"\" }", "utf8");
                res.redirect("/");
            }
        );
    } else {
        res.send('ERROR - no Authentication code returned.');
    }
});

app.get('/evesso', function (req, res) {
    res.redirect("https://login.eveonline.com/oauth/authorize/" +
        "?response_type=code" +
        "&client_id=" + clientID +
        "&scope=" + scopes +
        "&redirect_uri=" + redirectURI +
        "&state=WhoCaresAboutSecurity");
});


app.get('/forceupdatetoken', function (req, res) {
    updateShortTermToken();
    res.redirect("/");
});