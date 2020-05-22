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
    * You should be able to download any .7z file containing one or a series of .xml files in which the data is arranged similarly to the stackexchange dumps. If that is what you wish to do, change the urlStart constant in the source code to change where you are downloading from.

## To do:
* Clean up code
* Add strong typing where it is missing
* Proper error handling
* Add foreign keys
* Decide on how much scanning should be done, column types are inferred based on a selection of rows. While it is (in theory) not foolproof in determining column types, it has thus far been able to do so by looking at 100 rows rather than scanning the whole file, which largely decreases runtime by some function of dump size.
* Add a loading bar if possible because it's impossible to tell how far along a download is