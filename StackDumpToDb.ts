const https = require('https');
const fs = require('fs');
const _7z = require('7zip-min');
const convert = require('xml-js');
const urlStart: string = 'https://ia800107.us.archive.org/27/items/stackexchange/';

const {Pool} = require('pg');
const raw: string = fs.readFileSync('./config.json');
const config = JSON.parse(raw);

const pool = new Pool({
    user: config.username,
    host: config.address,
    database: config.database,
    password: config.password,
    port: config.port,
});

//Section 1: Choose Stackexchange dump, download and unzip
//Main function
let choice: string;
if(process.argv.length === 3) {
    choice = process.argv[2];
    let download = downloadFile(urlStart + choice);
    download.then(function() {
        console.log('Download complete. Unzipping...');
        let unzip = unzipFile();
        unzip.then(function() {
            console.log('Unzipping complete.');
            fs.unlinkSync('./' + choice);
            generateQueries();
        })
        
    }, function(err) {
        console.log(err);
    })
} else {
    console.log('Enter the name of one stackexchange dump from the list available at ' + urlStart);
    process.exit(0);
}

/*
Downloads a file from a given url.
*/
function downloadFile(url: string) {
    return new Promise((resolve, reject) => {
		https.get(urlStart + choice, (response) => {
			let chunks_of_data = [];

			response.on('data', (fragments) => {
				chunks_of_data.push(fragments);
			});

			response.on('end', () => {
				let response_body = Buffer.concat(chunks_of_data);
                resolve(fs.writeFileSync(choice, response_body));
			});

			response.on('error', (error) => {
				reject(error);
			});
		});
    });
}

/*
Unzips a file using 7zip-min.
*/
function unzipFile() {
    return new Promise((resolve) => {
		_7z.unpack('./' + choice, './Output', err => {
			resolve();
		});
    });
}

//Section 2: Generate and execute queries
function generateQueries(): void {
    //Create schema and get list of xml files
    choice = choice.replace('.meta','_meta');
    if(Number(choice.charAt(0) || choice.charAt(0) === '0')) {
        choice = '_' + choice;
    }
    let firstQuery = 'CREATE SCHEMA ' + choice.substr(0, choice.indexOf('.'));
    firstQuery += '; SET search_path TO ' + choice.substr(0, choice.indexOf('.')) + ';';
    fs.writeFileSync('./Output/temp.sql', firstQuery);
    
    let xmlList: string[] = fs.readdirSync('./Output');
    xmlList = xmlList.filter(file => file.substring(file.length - 3) === 'xml');
    
    //Loop through files in folder
    let lastRow: boolean = false;
    for(let i = 0; i < xmlList.length; i++) {

        //Read XML to create an array of rows, cut off XML tags at beginning of file
        let fileName: string = xmlList[i].toLowerCase();
        let splitText: string[] = (fs.readFileSync('./Output/' + xmlList[i])).toString('utf-8').split('\n');
        splitText = splitText.slice(2, splitText.length - 1);
        let jsonArray = [];
        for(let i = 0; i < splitText.length; i++) {
            jsonArray[i] = convert.xml2js(splitText[i], {compact: true});
        }
        splitText = null;

        //Generate column names(keys) and column data types
        const keys: string[] = generateKeys(jsonArray.slice(0, 101));
        const dataTypes: string[] = generateTypes(jsonArray, keys);

        //Generate SQL queries
        if(i === xmlList.length - 1) {
            lastRow = true;
        }
        generateCreate(fileName, dataTypes, keys);
        generateInsert(fileName, jsonArray, keys, dataTypes, lastRow);
        console.log(fileName + ' processed.');
        
    }

    const superQuery = {
        text: fs.readFileSync('./Output/temp.sql').toString(),
        rowMode: 'array',
    }
    console.log('Submitting queries to database...');
    pool.query(superQuery, (err) => {
        if (err) {
            return console.error('Error executing query', console.log(err));
        } else {
            cleanUp(xmlList);
        }
    });
    pool.end();
    
}

/*
Generates a keys: string[] array that contains the names of each attribute.
*/
function generateKeys(jsonArray): string[] {
    let keys: string[] = [];
    for(let i = 0; i < jsonArray.length; i++) {
        let temp: string[] = Object.getOwnPropertyNames(jsonArray[i].row._attributes);
        if(temp.length > keys.length) {
            keys = temp;
        }
    }
    return keys;
}

/*
Generates a dataTypes: number[] array that contains the data type of each key.
*/
function generateTypes(jsonArray, keys: string[]): string[] {
    const dataTypes: string[] = [];
    let currentColumn: string = '';

    for(let i = 0; i < keys.length; i++) {
        currentColumn = jsonArray[0].row._attributes[keys[i]];

        //If first row has undefined attribute, check next row for initial attribute until one is found
        if(currentColumn === undefined) {
            for(let j = 1; j < jsonArray.length && currentColumn === undefined; j++) {
                currentColumn = jsonArray[j].row._attributes[keys[i]];
            }
        }
        
        if(Number(currentColumn) || Number(currentColumn) === 0) {
            dataTypes.push('INTEGER');
        } else if(new Date(currentColumn).toString() !== 'Invalid Date') {
            dataTypes.push('TIMESTAMP');
        } else if(currentColumn.toLowerCase() === 'false' || currentColumn.toLowerCase() === 'true') {
            dataTypes.push('BOOLEAN');
        } else {
            dataTypes.push('TEXT');
        }
    }
    //Checks if any rows don't match the first row's dataTypes
    //Possible optimization to be done here
    for(let i = 1; i < 100 && i < jsonArray.length; i++) {
        let invalid: boolean = false;
        for(let j = 0; j < dataTypes.length && !invalid; j++) {
            currentColumn = jsonArray[i].row._attributes[keys[j]];

            if(currentColumn !== undefined) {
                if(dataTypes[j] === 'INTEGER') {
                    if(!Number(currentColumn) && Number(currentColumn) !== 0) {
                        dataTypes[j] = 'TEXT';
                        invalid = true;
                    }
                } else if(dataTypes[j] === 'TIMESTAMP') {
                    if(new Date(currentColumn).toString() === 'Invalid Date') {
                        dataTypes[j] = 'TEXT';
                        invalid = true;
                    }
                } else if(dataTypes[j] === 'BOOLEAN') {
                    if(currentColumn.toLowerCase() !== 'false' && currentColumn.toLowerCase() !== 'true') {
                        dataTypes[j] = 'TEXT';
                        invalid = true;
                    }
                }
            }
        }
    }
    
    return dataTypes;
}

/*
Generates the CREATE TABLE SQL statement for one .xml file.
*/
function generateCreate(fileName: string, dataTypes: string[], keys: string[]): void {
    let query: string;

    console.log('Processing ' + fileName + '...');
    query = 'CREATE TABLE ' + fileName.replace('.xml','') + '(\n';
    for(let i = 0; i < keys.length; i++) {
        if(i === 0) {
            query += keys[i] + ' ' + dataTypes[i] + ' PRIMARY KEY,\n';
        } else if(i === keys.length - 1) {
            query += keys[i] + ' ' + dataTypes[i] + '\n);\n\n';
        } else {
            query += keys[i] + ' ' + dataTypes[i] + ',\n';
        }
    }
    fs.appendFileSync('./Output/temp.sql', query);
}

/*
Generates the INSERT ROW SQL statements for one .xml file.
*/
function generateInsert(fileName: string, jsonArray, keys: string[], dataTypes: string[], lastRow: boolean): void {
    let query: string;
    let value: string;

    for(let i = 0; i < jsonArray.length; i++) {
        query = 'INSERT INTO ' + fileName.replace('.xml','') + ' VALUES(';
        for(let j = 0; j < keys.length; j++) {
            value = jsonArray[i].row._attributes[keys[j]];
            if(value) {
                if(dataTypes[j] === 'TEXT') {
                    value = value.replace(/\'/g,'\'\'');
                    query += '\'' + value + '\'';
                } else if(dataTypes[j] === 'INTEGER') {
                    query += value;
                } else if(dataTypes[j] === 'BOOLEAN') {
                    query += value.toLowerCase();
                } else {
                    query += '\'' + value + '\'';
                }
            } else {
                query += 'NULL';
            }
            if(j !== keys.length - 1) {
                query += ', ';
            }
        }
        if(i === jsonArray.length - 1 && lastRow) {
            //node-postgres requires that the last statement not have a semicolon as it is added automatically
            query += ')';
        } else {
            query += ');\n';
        }
        fs.appendFileSync('./Output/temp.sql', query);
    }
}

/*
Deletes .xml, .sql and the directory used to hold those files after the query has run.
*/
function cleanUp(xmlList: string[]): void {
    for(let i = 0; i < xmlList.length; i++) {
        fs.unlinkSync('./Output/' + xmlList[i]);
    }

    fs.unlinkSync('./Output/temp.sql');
    fs.rmdirSync('./Output');
    console.log('Queries submitted.');
}