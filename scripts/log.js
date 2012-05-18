/**
 *  Initialization
 */
$(function() {
	loadDevices();
	
	updateBodyData();
	
	// Setup event listeners
	$(window).bind( 'hashchange', function(e) { 
		if (window.location.hash != "" && window.location.hash != "#") {
			updateBodyData();
		}
	});
	$(window).scroll(function(){
		// if the bottom of the changeset div is showing start loading the new changes
		if ($(window).scrollTop() + $(window).height() >= $("#log_Changeset").offset().top + $("#log_Changeset").height() - 250) {
			if (global_ChangesetHasMore) {
				updateChangeset(global_CurrentDevice, global_CurrentVersion, global_CurrentDate, undefined, true, global_ChangesetMoreSortCode);
			}
		}
	});
});

var global_CurrentDevice = "";
var global_CurrentVersion = "";
var global_CurrentDate = "";

function updateBodyData() {
	var url = window.location.hash.substring(1);
	var params = url.split("/");
	
	if (global_CurrentDevice != params[0]) {
		updateListNightlies(params[0], params[1]);
	}

	// scroll up if needed (to avoid loading changes down to the current scroll)
	if ($(window).scrollTop() > 0) {
		$('body').animate({scrollTop : 0}, 'fast', function() {
			updateChangeset(params[0], params[1], params[2]);
		});
		$('#log_Changeset').fadeOut('fast', function() {
			$(this).fadeIn(0);
		});
	} else {
		updateChangeset(params[0], params[1], params[2]);
	}

	global_CurrentDevice = params[0];
	global_CurrentVersion = params[1];
	global_CurrentDate = params[2];
}


var global_DeviceCodeRepos = [];

/**
 *  Load devices list from devices.xml
 */
function loadDevices() {
	$.ajax({
		type:"GET",
		url:"devices.xml",
		dataType:"xml"})
	.done(function(data) {
		$("#nav_DevicesList").html('');
		$(data).find("oem").each(function() {

			var oem = $('<li class="dropdown"></li>');
			$('<a class="dropdown-toggle" data-toggle="dropdown">' + $(this).attr("name") + '</a>').appendTo(oem);

			var devices = $('<ul class="dropdown-menu" style="width:250px"></ul>').appendTo(oem);
			
			// for each device
			$(this).find("device").each(function() {
				var device = $('<li><a href="#' + $(this).children("code").text() + '/cm9/next"><img src="' + $(this).children("image").text() + '" style="float:left;height:35px;margin-right:10px" /><strong>' + $(this).children("name").text() + '</strong><br />'+$(this).children("model").text()+' / '+$(this).children("code").text()+'</a></li>').appendTo(devices);
				
				var code = $(this).children("code").text();
				global_DeviceCodeRepos[code] = [];

				
				$(this).children("repos").find("git").each(function() {
					global_DeviceCodeRepos[code].push($(this).attr("name"));
				});
			});
			
			$("#nav_DevicesList").append(oem);
		});
	});
}




var global_LastNightlyDate = 0;
var global_NightliesCodeToDate = [];
var global_NightliesCodeToPreviousDate = [];
var global_NightliesListReady = false;


function updateListNightlies(_device, _version) {
	global_NightliesListReady = false;
	if (_device == '') {
		$("#log_NightliesList").html("");
		global_NightliesListReady = true;
		return;	
	}
	
	// load device nightlies
	$.get("rss_proxy.php?device=" + _device, function(data) {
		var xmlParse = $.parseXML(data);
		
		// clear current nightlies list
		$("#log_NightliesList").children().each(function() { $(this).remove(); } );
		
		// empty dates cache
		global_LastNightlyDate = 0;
		global_NightliesCodeToDate.length = 0;
		global_NightliesCodeToPreviousDate.length = 0;		// this sounds a bit haxxy, but it's the easiest way.
		
		// add "next nightly" and "downloads" option
		$("#log_NightliesList").append('<li><a href="#'+_device+'/'+_version+'/next">Next nightly</a></li><li><a href="http://get.cm/?device='+_device+'" target="_blank">Downloads</a></li>');
		
		var currMonth = "";
		var lastNightlyCode = "";

		var amount = 9;
		
		// for each nightly
		$(xmlParse).find('item').each(function() {
			if (amount <= 0) {
				return;
			}
			amount--;

			var nightlyTime = strtotime($(this).children("pubDate").text());
			
			// if the current month changes, show a new header line
			if (currMonth != date("m", nightlyTime)) {
				$("#log_NightliesList").append('<li class="nav-header">' + date("M Y", nightlyTime) + '</li>');
				currMonth = date("m", nightlyTime);
			}
			
			
			$("#log_NightliesList").append('<li><a href="#'+_device+'/'+_version+'/'+date("Ymd",nightlyTime)+'">' + date('l dS', nightlyTime) + '<br /><small>' + $(this).children("title").text() + "</small></a></li>");
			
			if (nightlyTime > global_LastNightlyDate)
				global_LastNightlyDate = nightlyTime;
				
			global_NightliesCodeToDate[date("Ymd",nightlyTime)] = nightlyTime;
			
			if (lastNightlyCode != "")
				global_NightliesCodeToPreviousDate[lastNightlyCode] = nightlyTime;
				
			lastNightlyCode = date("Ymd",nightlyTime);
		});
		
		
		global_NightliesListReady = true;
	});
		
}

var global_ChangesetHasMore = false;
var global_ChangesetMoreSortCode = '';

function updateChangeset(_device, _version, _date, _amount, _append, _sortCode) {
	_amount = typeof _amount !== 'undefined' ? _amount : 25;
	_append = typeof _append !== 'undefined' ? _append : false;
	_sortCode = typeof _sortCode !== 'undefined' ? _sortCode : '';

	if (global_NightliesListReady == false && _device != '') {
		// the nightlies list isn't ready, which will fail ageQuery below. We delay this function
		console.log("Nightlies not ready, delaying changeset");
		$("#log_Changeset").html("<li><h6>Please wait while nightlies are being loaded…</h6></<li>");
		setTimeout(function() { updateChangeset(_device,_version,_date, _amount, _append, _sortCode) }, 500);
		return;	
	}

	global_ChangesetHasMore = false;
	global_ChangesetMoreSortCode = '';
	
	// if no device is set, show all latest changes. Else, show device+date
	if (_device == '') {
		$("#log_NightlyTitle").html("CyanogenMod for all devices<br /><small>Narrow down your query by selecting a device.</small>");	
	} else {
		$("#log_NightlyTitle").text(_date + " nightly for " + _device);
	}
	
	
	if (!_append) {
		$("#log_Changeset").html("<li><h6>Please wait while changes are being loaded…</h6></<li>");
	}
	
	
	// compute age for old nightlies
	var ageQuery = "";
	
	if (_date != "next") {
		ageQuery = "age:" + (time() - global_NightliesCodeToDate[_date]) + "s:" + (time() - global_NightliesCodeToPreviousDate[_date]) + "s";
	}
	
	// load all changes from gerrit
	$.getJSON("gerrit_proxy.php?url=/rpc/ChangeListService&params=" + encodeURI("status:merged branch:ics " + ageQuery) + "&amount=" + _amount + "&sortCode=" + _sortCode, function(data) {
		if (!_append) {
			// clear current changesets
			$("#log_Changeset").html('');
		}

		console.log("Changeset contains " + data.result.changes.length + " elements.");
		
		for (var i = 0; i < data.result.changes.length; i++) {
			// if not "next" nightly, skip until changes of that nightly
			var updateTime = strtotime(data.result.changes[i].lastUpdatedOn);
			
			if (_date != "next" && updateTime > global_NightliesCodeToDate[_date]) {
				continue;
			}
			
			// if we reached nightly end date, stop	
			if (_date == "next") {
				if (updateTime < global_LastNightlyDate)
					break;
			}
			else {
				if (updateTime < global_NightliesCodeToPreviousDate[_date])
					break;
			}
			
			// set a specific style for translation
			var itemStyle = "padding-left:10px;";
			if (data.result.changes[i].subject.indexOf("translat") != -1 || data.result.changes[i].subject.indexOf("Translat") != -1) {
				itemStyle +="opacity:0.5;border-left:2px solid #9933CC;";
			} else {
				// if it's a repo for the device, put it in a special color
				var found = false;
				if (global_DeviceCodeRepos[_device] != undefined) {
					for (var j = 0; j < global_DeviceCodeRepos[_device].length; j++) {
						if (global_DeviceCodeRepos[_device][j] == data.result.changes[i].project.key.name.substring(12)) {
							found = true;
							itemStyle += "border-left:2px solid #99CC00";
							break;
						}
					}
				}
				
				if (!found) {
					// else, put default color
					itemStyle += "border-left:2px solid #0099CC;";
				}
			}
			
			$("#log_Changeset").append('<li style="' + itemStyle + '"><a href="javascript:;" style="color:white">' + data.result.changes[i].subject + '<br /><h6>Merged on <span style="color:#669900">' + date("M dS", strtotime(data.result.changes[i].lastUpdatedOn)) + " at " + date("H:i:s", strtotime(data.result.changes[i].lastUpdatedOn)) + '</span> in <span style="color:#FF8800">' + data.result.changes[i].project.key.name.substring(12) + '</span></h6></a></li>'); 
			
			if (i == _amount - 1) {
				global_ChangesetHasMore = true;
				global_ChangesetMoreSortCode = data.result.changes[i].sortKey;
				// if the bottom of the changeset div is already showing, start loading the new changes
				if ($(window).scrollTop() + $(window).height() >= $("#log_Changeset").offset().top + $("#log_Changeset").height() - 250) {
					updateChangeset(_device, _version, _date, _amount, true, global_ChangesetMoreSortCode);
				}
				break;
			}
		}
		

	});
}







function time () {
   return Math.floor(new Date().getTime() / 1000);
}

// PHP strtotime
// phpjs.org
function strtotime (str, now) {
    // http://kevin.vanzonneveld.net
    // +   original by: Caio Ariede (http://caioariede.com)
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +      input by: David
    // +   improved by: Caio Ariede (http://caioariede.com)
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Wagner B. Soares
    // +   bugfixed by: Artur Tchernychev
    // %        note 1: Examples all have a fixed timestamp to prevent tests to fail because of variable time(zones)
    // *     example 1: strtotime('+1 day', 1129633200);
    // *     returns 1: 1129719600
    // *     example 2: strtotime('+1 week 2 days 4 hours 2 seconds', 1129633200);
    // *     returns 2: 1130425202
    // *     example 3: strtotime('last month', 1129633200);
    // *     returns 3: 1127041200
    // *     example 4: strtotime('2009-05-04 08:30:00');
    // *     returns 4: 1241418600
    var i, l, match, s, parse = '';

    str = str.replace(/\s{2,}|^\s|\s$/g, ' '); // unecessary spaces
    str = str.replace(/[\t\r\n]/g, ''); // unecessary chars
    if (str === 'now') {
        return now === null || isNaN(now) ? new Date().getTime() / 1000 | 0 : now | 0;
    } else if (!isNaN(parse = Date.parse(str))) {
        return parse / 1000 | 0;
    } else if (now) {
        now = new Date(now * 1000); // Accept PHP-style seconds
    } else {
        now = new Date();
    }

    str = str.toLowerCase();

    var __is = {
        day: {
            'sun': 0,
            'mon': 1,
            'tue': 2,
            'wed': 3,
            'thu': 4,
            'fri': 5,
            'sat': 6
        },
        mon: [
            'jan',
            'feb',
            'mar',
            'apr',
            'may',
            'jun',
            'jul',
            'aug',
            'sep',
            'oct',
            'nov',
            'dec'
        ]
    };

    var process = function (m) {
        var ago = (m[2] && m[2] === 'ago');
        var num = (num = m[0] === 'last' ? -1 : 1) * (ago ? -1 : 1);
        
        switch (m[0]) {
        case 'last':
        case 'next':
            switch (m[1].substring(0, 3)) {
            case 'yea':
                now.setFullYear(now.getFullYear() + num);
                break;
            case 'wee':
                now.setDate(now.getDate() + (num * 7));
                break;
            case 'day':
                now.setDate(now.getDate() + num);
                break;
            case 'hou':
                now.setHours(now.getHours() + num);
                break;
            case 'min':
                now.setMinutes(now.getMinutes() + num);
                break;
            case 'sec':
                now.setSeconds(now.getSeconds() + num);
                break;
            case 'mon':
                if (m[1] === "month") {
                    now.setMonth(now.getMonth() + num);
                    break;
                }
                // fall through
            default:
                var day = __is.day[m[1].substring(0, 3)];
                if (typeof day !== 'undefined') {
                    var diff = day - now.getDay();
                    if (diff === 0) {
                        diff = 7 * num;
                    } else if (diff > 0) {
                        if (m[0] === 'last') {
                            diff -= 7;
                        }
                    } else {
                        if (m[0] === 'next') {
                            diff += 7;
                        }
                    }
                    now.setDate(now.getDate() + diff);
                    now.setHours(0, 0, 0, 0); // when jumping to a specific last/previous day of week, PHP sets the time to 00:00:00
                }
            }
            break;

        default:
            if (/\d+/.test(m[0])) {
                num *= parseInt(m[0], 10);

                switch (m[1].substring(0, 3)) {
                case 'yea':
                    now.setFullYear(now.getFullYear() + num);
                    break;
                case 'mon':
                    now.setMonth(now.getMonth() + num);
                    break;
                case 'wee':
                    now.setDate(now.getDate() + (num * 7));
                    break;
                case 'day':
                    now.setDate(now.getDate() + num);
                    break;
                case 'hou':
                    now.setHours(now.getHours() + num);
                    break;
                case 'min':
                    now.setMinutes(now.getMinutes() + num);
                    break;
                case 'sec':
                    now.setSeconds(now.getSeconds() + num);
                    break;
                }
            } else {
                return false;
            }
            break;
        }
        return true;
    };

    match = str.match(/^(\d{2,4}-\d{2}-\d{2})(?:\s(\d{1,2}:\d{2}(:\d{2})?)?(?:\.(\d+))?)?$/);
    if (match !== null) {
        if (!match[2]) {
            match[2] = '00:00:00';
        } else if (!match[3]) {
            match[2] += ':00';
        }

        s = match[1].split(/-/g);

        s[1] = __is.mon[s[1] - 1] || s[1];
        s[0] = +s[0];

        s[0] = (s[0] >= 0 && s[0] <= 69) ? '20' + (s[0] < 10 ? '0' + s[0] : s[0] + '') : (s[0] >= 70 && s[0] <= 99) ? '19' + s[0] : s[0] + '';
        return parseInt(this.strtotime(s[2] + ' ' + s[1] + ' ' + s[0] + ' ' + match[2]) + (match[4] ? match[4] / 1000 : ''), 10);
    }

    var regex = '([+-]?\\d+\\s' + '(years?|months?|weeks?|days?|hours?|min|minutes?|sec|seconds?' + '|sun\\.?|sunday|mon\\.?|monday|tue\\.?|tuesday|wed\\.?|wednesday' + '|thu\\.?|thursday|fri\\.?|friday|sat\\.?|saturday)' + '|(last|next)\\s' + '(years?|months?|weeks?|days?|hours?|min|minutes?|sec|seconds?' + '|sun\\.?|sunday|mon\\.?|monday|tue\\.?|tuesday|wed\\.?|wednesday' + '|thu\\.?|thursday|fri\\.?|friday|sat\\.?|saturday))' + '(\\sago)?';

    match = str.match(new RegExp(regex, 'gi')); // Brett: seems should be case insensitive per docs, so added 'i'
    if (match === null) {
        return false;
    }

    for (i = 0, l = match.length; i < l; i++) {
        if (!process(match[i].split(' '))) {
            return false;
        }
    }

    return now.getTime() / 1000 | 0;
}


// PHP date function
// phpjs.org
function date (format, timestamp) {
    // http://kevin.vanzonneveld.net
    // +   original by: Carlos R. L. Rodrigues (http://www.jsfromhell.com)
    // +      parts by: Peter-Paul Koch (http://www.quirksmode.org/js/beat.html)
    var that = this,
        jsdate, f, formatChr = /\\?([a-z])/gi,
        formatChrCb,
        // Keep this here (works, but for code commented-out
        // below for file size reasons)
        //, tal= [],
        _pad = function (n, c) {
            if ((n = n + '').length < c) {
                return new Array((++c) - n.length).join('0') + n;
            }
            return n;
        },
        txt_words = ["Sun", "Mon", "Tues", "Wednes", "Thurs", "Fri", "Satur", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    formatChrCb = function (t, s) {
        return f[t] ? f[t]() : s;
    };
    f = {
        // Day
        d: function () { // Day of month w/leading 0; 01..31
            return _pad(f.j(), 2);
        },
        D: function () { // Shorthand day name; Mon...Sun
            return f.l().slice(0, 3);
        },
        j: function () { // Day of month; 1..31
            return jsdate.getDate();
        },
        l: function () { // Full day name; Monday...Sunday
            return txt_words[f.w()] + 'day';
        },
        N: function () { // ISO-8601 day of week; 1[Mon]..7[Sun]
            return f.w() || 7;
        },
        S: function () { // Ordinal suffix for day of month; st, nd, rd, th
            var j = f.j();
            return j < 4 | j > 20 && ['st', 'nd', 'rd'][j%10 - 1] || 'th'; 
        },
        w: function () { // Day of week; 0[Sun]..6[Sat]
            return jsdate.getDay();
        },
        z: function () { // Day of year; 0..365
            var a = new Date(f.Y(), f.n() - 1, f.j()),
                b = new Date(f.Y(), 0, 1);
            return Math.round((a - b) / 864e5) + 1;
        },

        // Week
        W: function () { // ISO-8601 week number
            var a = new Date(f.Y(), f.n() - 1, f.j() - f.N() + 3),
                b = new Date(a.getFullYear(), 0, 4);
            return _pad(1 + Math.round((a - b) / 864e5 / 7), 2);
        },

        // Month
        F: function () { // Full month name; January...December
            return txt_words[6 + f.n()];
        },
        m: function () { // Month w/leading 0; 01...12
            return _pad(f.n(), 2);
        },
        M: function () { // Shorthand month name; Jan...Dec
            return f.F().slice(0, 3);
        },
        n: function () { // Month; 1...12
            return jsdate.getMonth() + 1;
        },
        t: function () { // Days in month; 28...31
            return (new Date(f.Y(), f.n(), 0)).getDate();
        },

        // Year
        L: function () { // Is leap year?; 0 or 1
            var j = f.Y();
            return j%4==0 & j%100!=0 | j%400==0;
        },
        o: function () { // ISO-8601 year
            var n = f.n(),
                W = f.W(),
                Y = f.Y();
            return Y + (n === 12 && W < 9 ? -1 : n === 1 && W > 9);
        },
        Y: function () { // Full year; e.g. 1980...2010
            return jsdate.getFullYear();
        },
        y: function () { // Last two digits of year; 00...99
            return (f.Y() + "").slice(-2);
        },

        // Time
        a: function () { // am or pm
            return jsdate.getHours() > 11 ? "pm" : "am";
        },
        A: function () { // AM or PM
            return f.a().toUpperCase();
        },
        B: function () { // Swatch Internet time; 000..999
            var H = jsdate.getUTCHours() * 36e2,
                // Hours
                i = jsdate.getUTCMinutes() * 60,
                // Minutes
                s = jsdate.getUTCSeconds(); // Seconds
            return _pad(Math.floor((H + i + s + 36e2) / 86.4) % 1e3, 3);
        },
        g: function () { // 12-Hours; 1..12
            return f.G() % 12 || 12;
        },
        G: function () { // 24-Hours; 0..23
            return jsdate.getHours();
        },
        h: function () { // 12-Hours w/leading 0; 01..12
            return _pad(f.g(), 2);
        },
        H: function () { // 24-Hours w/leading 0; 00..23
            return _pad(f.G(), 2);
        },
        i: function () { // Minutes w/leading 0; 00..59
            return _pad(jsdate.getMinutes(), 2);
        },
        s: function () { // Seconds w/leading 0; 00..59
            return _pad(jsdate.getSeconds(), 2);
        },
        u: function () { // Microseconds; 000000-999000
            return _pad(jsdate.getMilliseconds() * 1000, 6);
        },

        // Timezone
        e: function () { // Timezone identifier; e.g. Atlantic/Azores, ...
            // The following works, but requires inclusion of the very large
            // timezone_abbreviations_list() function.
/*              return this.date_default_timezone_get();
*/
            throw 'Not supported (see source code of date() for timezone on how to add support)';
        },
        I: function () { // DST observed?; 0 or 1
            // Compares Jan 1 minus Jan 1 UTC to Jul 1 minus Jul 1 UTC.
            // If they are not equal, then DST is observed.
            var a = new Date(f.Y(), 0),
                // Jan 1
                c = Date.UTC(f.Y(), 0),
                // Jan 1 UTC
                b = new Date(f.Y(), 6),
                // Jul 1
                d = Date.UTC(f.Y(), 6); // Jul 1 UTC
            return 0 + ((a - c) !== (b - d));
        },
        O: function () { // Difference to GMT in hour format; e.g. +0200
            var tzo = jsdate.getTimezoneOffset(),
                a = Math.abs(tzo);
            return (tzo > 0 ? "-" : "+") + _pad(Math.floor(a / 60) * 100 + a % 60, 4);
        },
        P: function () { // Difference to GMT w/colon; e.g. +02:00
            var O = f.O();
            return (O.substr(0, 3) + ":" + O.substr(3, 2));
        },
        T: function () {
            return 'UTC';
        },
        Z: function () { // Timezone offset in seconds (-43200...50400)
            return -jsdate.getTimezoneOffset() * 60;
        },

        // Full Date/Time
        c: function () { // ISO-8601 date.
            return 'Y-m-d\\TH:i:sP'.replace(formatChr, formatChrCb);
        },
        r: function () { // RFC 2822
            return 'D, d M Y H:i:s O'.replace(formatChr, formatChrCb);
        },
        U: function () { // Seconds since UNIX epoch
            return jsdate / 1000 | 0;
        }
    };
    this.date = function (format, timestamp) {
        that = this;
        jsdate = (timestamp == null ? new Date() : // Not provided
        (timestamp instanceof Date) ? new Date(timestamp) : // JS Date()
        new Date(timestamp * 1000) // UNIX timestamp (auto-convert to int)
        );
        return format.replace(formatChr, formatChrCb);
    };
    return this.date(format, timestamp);
}