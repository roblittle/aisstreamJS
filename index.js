const fs = require('fs');
const WebSocket = require('ws');
const moment = require('moment-timezone');
const splitArray = require('split-array');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const logger = require('./logger');

let vessels = {};
let sockets = [];

async function startWebSocket(mmsiGroup, retries = 0) {
    const socket = new WebSocket(process.env.WEBSOCKET_URL || "wss://stream.aisstream.io/v0/stream");
    sockets.push(socket);

    socket.onopen = function (_) {
        let subscriptionMessage = {
            Apikey: process.env.AIS_STREAM_API_KEY,
            BoundingBoxes: [[[54.031167,-133.890421], [48.016568,-122.457169]]],    // West Coast Canada 
            FiltersShipMMSI: mmsiGroup,
            FilterMessageTypes: ["PositionReport"]
        }
        socket.send(JSON.stringify(subscriptionMessage));
    };

    socket.onmessage = function (event) {
        let aisMessage = JSON.parse(event.data)
        handleAISMessage(aisMessage);
    };

    socket.onerror = (error) => {
        logger.error(`WebSocket error: ${error}`);
        if (retries < 3) {
            logger.info('Reconnecting...');
            setTimeout(() => startWebSocket(mmsiGroup, retries + 1), 5000);
        } else {
            logger.error('Max retries exceeded. Could not establish connection.');
        }
    };

    socket.onclose = (event) => {
        if (!event.wasClean) {
            logger.error(`WebSocket connection lost with code ${event.code}`);
            if (retries < 3) {
                logger.info('Reconnecting...');
                setTimeout(() => startWebSocket(mmsiGroup, retries + 1), 5000);
            } else {
                logger.error('Max retries exceeded. Could not establish connection.');
            }
        }
    };
}

async function handleAISMessage(aisMessage) {
    if (aisMessage["MessageType"] === "PositionReport") {
        let positionReport = aisMessage["Message"]["PositionReport"];
        let metaData = aisMessage["MetaData"];
        let vesselId = positionReport["UserID"];
        let vesselName = metaData["ShipName"] ? metaData["ShipName"] : vesselId;
        let timestamp = formatDate(moment.utc(metaData["time_utc"], "YYYYMMDDHHmmss").tz('America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss'));
		console.log(vesselName + ' ' + vesselId);
        vessels[vesselId] = {
            VesselName: vesselName,
            Longitude: positionReport['Longitude'],
            Latitude: positionReport['Latitude'],
            Direction: positionReport['TrueHeading'],
            Speed: positionReport['Sog'],
            Timestamp: timestamp
        };
    }
}

// 
async function writeToFile() {
    try {
        let rawData = fs.readFileSync('ais_output.txt', 'utf8');
        let fileData = {};

        if (rawData) {
            let lines = rawData.trim().split('\n');
            lines.forEach(line => {
                let [mmsi, ...rest] = line.split('|');
                fileData[mmsi] = rest.join('|');
            });
        }

        for (let mmsi in vessels) {
            let data = vessels[mmsi];
            fileData[mmsi] = `${data.VesselName}|${data.Longitude}|${data.Latitude}|${data.Direction}|${data.Speed}|${data.Timestamp}`;
        }

        let newData = '';
        for (let mmsi in fileData) {
            newData += `${mmsi}|${fileData[mmsi]}\n`;
        }

        fs.writeFileSync('ais_output.txt', newData, 'utf8');
        logger.info('File updated');
    } catch (error) {
        logger.error(`File write error: ${error}`);
    }
}

// Format date to yyyymmdd24hMMSS ie 20230808152257 
function formatDate(date) {
    let d = new Date(date),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear(),
    hour = '' + d.getHours(),
    minute = '' + d.getMinutes(),
    second = '' + d.getSeconds();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;
    if (hour.length < 2) 
        hour = '0' + hour;
    if (minute.length < 2) 
        minute = '0' + minute;
    if (second.length < 2) 
        second = '0' + second;

    return [year, month, day, hour, minute, second].join('');
}

async function readMMSIConfig() {
    let data = await readFile('config.json', 'utf-8');
    let config = JSON.parse(data);
    let mmsiGroups = splitArray(config.MMSI, 20);

    for (let mmsiGroup of mmsiGroups) {
        startWebSocket(mmsiGroup);
    }
}

readMMSIConfig();
setInterval(() => {
       writeToFile();
   }, 30000); // 30000 milliseconds = 30 seconds

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown() {
    logger.info('Received kill signal, shutting down gracefully...');
    for (let socket of sockets) {
        socket.close();
    }
    writeToFile();
    process.exit(); // Force shutdown after writing remaining data
}