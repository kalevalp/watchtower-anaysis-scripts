const log_scraper = require('cloudwatch-log-scraper');
const fs = require('fs');

function getRandFname() {
    const fiveDigitID = Math.floor(Math.random() * Math.floor(99999));
    return `runResults-${fiveDigitID}`;
}

async function full_profile_report_times(region, fname) {

    const scraper = new log_scraper.LogScraper(region);

    const fullRepPattern = 'WT_PROF FULL REPORT';
    const fullRepRE = /@@@@WT_PROF: FULL REPORT ---(.*)---/;

    const logGroup = '/aws/lambda/wt-full-flow-test-watchtower-monitor';
    const logItems = await scraper.getAllLogItemsForGroupMatching(logGroup, fullRepPattern);

    const reports = logItems.filter(item => item.message.match(fullRepRE)).map(item => JSON.parse(item.message.match(fullRepRE)[1]));

    const initial = reports.filter(item => item.phase === 'initialPhase');
    const stable  = reports.filter(item => item.phase === 'stablePhase');

    let fullReports;

    if (initial.length == 0) {

	fullReports = stable.map(rep =>
				 [rep.eventOccuredTimestamp - rep.eventOccuredTimestamp,
				  rep.eventKinesisArrivedTimestamp - rep.eventOccuredTimestamp,
				  rep.ingestionFunctionStartTime - rep.eventOccuredTimestamp,
				  rep.ddbWriteTime - rep.eventOccuredTimestamp,
				  rep.instanceTriggerKinesisTime - rep.eventOccuredTimestamp,
				  rep.triggerStartTime - rep.eventOccuredTimestamp,
				  rep.checkerFunctionInvokeTime - rep.eventOccuredTimestamp,
				  rep.violationDetectionTime - rep.eventOccuredTimestamp]
				)
    } else {

	fullReports = initial.map(rep => {
            const matchingStable = stable.find(item => JSON.stringify(rep.instance) === JSON.stringify(item.instance));
            rep.stableCheckerFunctionInvokeTime = matchingStable.checkerFunctionInvokeTime;
            rep.stableViolationDetectionTime = matchingStable.violationDetectionTime;

            return [rep.eventOccuredTimestamp - rep.eventOccuredTimestamp,
                    rep.eventKinesisArrivedTimestamp - rep.eventOccuredTimestamp,
                    rep.ingestionFunctionStartTime - rep.eventOccuredTimestamp,
                    rep.ddbWriteTime - rep.eventOccuredTimestamp,
                    rep.instanceTriggerKinesisTime - rep.eventOccuredTimestamp,
		    rep.triggerStartTime - rep.eventOccuredTimestamp,
                    rep.checkerFunctionInvokeTime - rep.eventOccuredTimestamp,
                    rep.violationDetectionTime - rep.eventOccuredTimestamp,
                    rep.stableCheckerFunctionInvokeTime - rep.eventOccuredTimestamp,
                    rep.stableViolationDetectionTime - rep.eventOccuredTimestamp];
	});

    }

    if (fname) {
        outputfname = fname;
    } else {
	getRandFname();
    }

    fs.writeFileSync(outputfname, JSON.stringify(fullReports));
}

async function notification_delay_times(region, fname) {
    const scraper = new log_scraper.LogScraper(region);

    const notificationDelayRE = /@@@@WT_PROF: VIOLATION REPORT DELAY: ([0-9]*)\(ms\)/;
    const delayPattern = 'WT_PROF VIOLATION REPORT DELAY';
    const logGroup = '/aws/lambda/wt-full-flow-test-watchtower-monitor';
    const logItems = await scraper.getAllLogItemsForGroupMatching(logGroup, delayPattern);

    const times = logItems.filter(item => item.message.match(notificationDelayRE)).map(item => Number(item.message.match(notificationDelayRE)[1]));

    let outputfname = getRandFname();

    if (process.argv[2]) {
        outputfname = process.argv[2];
    }

    fs.writeFileSync(outputfname, JSON.stringify(times));
}

module.exports.full_profile_report_times = full_profile_report_times;
module.exports.notification_delay_times = notification_delay_times;
