# aisstreamJS
An aisstream.io JavaScript client that takes in a set of MMSI values, records them to memory and then writes them to file.

The format of the file write is
MMSI|SHIP-NAME|LONG|LAT|HEADING|SPEED|DATE-TIMME
ie:
316001251|QUEEN OF COWICHAN|-123.95452666666667|49.19945499999999|194|13|20230808152103

#TODO
- config drive file write interval
- debug when sending one socket more than 35 or so (hence the batches of 20)
- make readme more professional
- verify output.txt exists, or create it
