# Create PostgresDB from StackExchange dump

This TypeScript file allows you to move a StackExchange dump to a PostgresDB.

## Dependencies
7zip-min
xml-js
pg

## Usage
* Create a database in psql to which you wish to move the data.
* Fill out the config.json file with the necessary connection details.
* Submit as an arg one of the links available at https://ia800107.us.archive.org/27/items/stackexchange/
    * Ex. node StackDumpToDb.js korean.stackexchange.com.7z

## To do:
* Clean up code
* Add strong typing where it is missing
* Proper error handling
* Add foreign keys
* Make proper console logs, the log statements that are currently there do not quite reflect what is going on
* Decide on how much scanning should be done, column types are inferred based on a selection of rows. While it is (in theory) not foolproof in determining column types, it has thus far been able to do so by looking at 100 rows rather than scanning the whole file, which largely decreases runtime by some function of dump size.
* Add a loading bar if possible because it's impossible to tell how far along a download is
* Add compatibility for more databases (such as 3dprinting.meta.com.7z), which currently run into errors
    * The databases that currently can't be imported properly have naming issues in node-postgres,
    such as starting with a number(3dprinting) or having extra periods(.meta databases).
    node-postgres alters the .sql queries, rather than simply reading them, which has caused many issues.