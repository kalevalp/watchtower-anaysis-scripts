const log_scraper = require('cloudwatch-log-scraper');
const fs = require('fs');

function getRandFname() {
    const fiveDigitID = Math.floor(Math.random() * Math.floor(99999));
    return `runResults-${fiveDigitID}`;
}

async function fullProfileReportTimes(region, appName, fname) {

    const scraper = new log_scraper.LogScraper(region);

    const fullRepPattern = 'WT_PROF FULL REPORT';
    const fullRepRE = /@@@@WT_PROF: FULL REPORT ---(.*)---/;

    const logGroup = `/aws/lambda/${appName}-watchtower-monitor`;
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

    let outputfname;

    if (fname) {
        outputfname = fname;
    } else {
	getRandFname();
    }

    fs.writeFileSync(outputfname, JSON.stringify(fullReports));
}

async function notificationDelayTimes(region, appName, fname) {
    const scraper = new log_scraper.LogScraper(region);

    const notificationDelayRE = /@@@@WT_PROF: VIOLATION REPORT DELAY: ([0-9]*)\(ms\)/;
    const delayPattern = 'WT_PROF VIOLATION REPORT DELAY';
    const logGroup = `/aws/lambda/${appName}-watchtower-monitor`;
    const logItems = await scraper.getAllLogItemsForGroupMatching(logGroup, delayPattern);

    const times = logItems.filter(item => item.message.match(notificationDelayRE)).map(item => Number(item.message.match(notificationDelayRE)[1]));


    let outputfname;

    if (fname) {
        outputfname = fname;
    } else {
	getRandFname();
    }

    fs.writeFileSync(outputfname, JSON.stringify(times));
}

async function ingestionRunTimes(region, appName, fname) {
    const logGroup = `/aws/lambda/${appName}-watchtower-ingestion`;

    await functionRunTimes(region, logGroup, fname);
}

async function checkerRunTimes(region, appName, fname) {
    const logGroup = `/aws/lambda/${appName}-watchtower-monitor`;

    await functionRunTimes(region, logGroup, fname);
}

async function functionRunTimes(region, logGroup, fname) {

    const scraper = new log_scraper.LogScraper(region);

    const runReportRE = /REPORT RequestId: [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\tDuration: ([0-9]*\.[0-9]*) ms/;
    const initReportRE = /Init Duration: ([0-9]*\.[0-9]*) ms/;
    const runReportPattern = "REPORT RequestId"

    const logItems = await scraper.getAllLogItemsForGroupMatching(logGroup, runReportPattern);

    const runTimes = logItems.map(item => item.message)
	.filter(message => message.match(runReportRE)) // sanity
	.map(message => {
	    const res = {};
	    res.runTime = Number(message.match(runReportRE)[1]);
	    if (message.match(initReportRE)) {
		res.isInit = true;
		res.initTime = message.match(initReportRE)[1];
            } else {
		res.isInit = false;
	    }
	    return res;
	})

    let outputfname = getRandFname();

    if (process.argv[2]) {
        outputfname = process.argv[2];
    }

    fs.writeFileSync(outputfname, JSON.stringify(runTimes));


}

module.exports.fullProfileReportTimes = fullProfileReportTimes;
module.exports.notificationDelayTimes = notificationDelayTimes;
module.exports.ingestionRunTimes = ingestionRunTimes
module.exports.checkerRunTimes = checkerRunTimes
module.exports.functionRunTimes = functionRunTimes
