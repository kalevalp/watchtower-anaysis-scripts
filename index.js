const log_scraper = require('cloudwatch-log-scraper');
const fs = require('fs');

const aws = require('aws-sdk');

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

async function getAllViolationReports(region, appName, fname) {

    const scraper = new log_scraper.LogScraper(region);

    const logGroup = `/aws/lambda/${appName}-watchtower-monitor`;

    const propRepPattern = "for property instance"
    // const potentialViolationRE = /Property (.*) was$ POTENTIALLY violated for property instance (.*)\. Failure triggered by event produced by Lambda invocation (.*)\./
    // const violationRE = /Property (.*) was violated for property instance (.*)\. Failure triggered by event produced by Lambda invocation (.*)\./
    // const holdsRE = /Property (.*) holds for property instance (.*)}/
    // const inconclusiveRE = /Property (.*) was not violated (but might be violated by future events) for property instance (.*)/

    let logItems = await scraper.getAllLogItemsForGroupMatching(logGroup, propRepPattern);

    logItems = logItems.map(item => item.message);


    writeDataToFile(logItems, fname);    
}

function writeDataToFile(data, fname) {

    let outputfname;
    if (fname) {
	outputfname = fname;
    } else if (process.argv[2]) {
        outputfname = process.argv[2];
    } else {
	outputfname = getRandFname();
    }

    fs.writeFileSync(outputfname, JSON.stringify(data));
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

    writeDataToFile(runTimes, fname);
}

async function getTTLdTableItems(region, tableName) {
    aws.config.update({region: region});

    const ddb = new aws.DynamoDB();

    let params = {
	TableName: tableName,
    };

    const ttlInfo = await ddb.describeTimeToLive(params).promise();

    params = {
	TableName: tableName
    };

    let lastEvaluatedKey = true;
    let content = [];

    while (lastEvaluatedKey) {
	console.log("scanning..");
	const response = await ddb.scan(params).promise();

	lastEvaluatedKey = response.LastEvaluatedKey;
	params.ExclusiveStartKey = lastEvaluatedKey;
	content.push(...response.Items);
    }

    const res = {allItems: content};

    if (ttlInfo.TimeToLiveDescription &&
	ttlInfo.TimeToLiveDescription.TimeToLiveStatus &&
	ttlInfo.TimeToLiveDescription.TimeToLiveStatus === "ENABLED") {
	const ttlField = ttlInfo.TimeToLiveDescription.AttributeName;
	res.deletedItems = content.filter(item => item[ttlField]);
    }
    return res;
}

module.exports.fullProfileReportTimes = fullProfileReportTimes;
module.exports.notificationDelayTimes = notificationDelayTimes;
module.exports.ingestionRunTimes = ingestionRunTimes
module.exports.checkerRunTimes = checkerRunTimes
module.exports.functionRunTimes = functionRunTimes
module.exports.getAllViolationReports = getAllViolationReports;
module.exports.getTTLdTableItems = getTTLdTableItems;

if (require.main === module) {
    console.log("Running test from main");
    getTTLdTableItems('eu-west-1','Watchtower-dev-MonitoredEvents')
	.then(res => console.log("Total items: ", res.allItems.length, "\n",
				 "Deleted items: ", res.deletedItems.length));
}

