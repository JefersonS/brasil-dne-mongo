var execSync = require('child_process').execSync,
    async = require('async'),
    fs = require('fs'),
    pathFiles = "",
    pathBase = "",
    pathUpdate = "",
    dbName = "",
    util = require('util');

pathFiles = "./atualizar";
pathBase = "./atualizados/base";
pathUpdate = "./atualizados/update";
dbName = "teste";

async.waterfall(
	[
		findFilesAndVersions,
		findUploadBase,
		uploadBase,
		prepareFiles,
		executeCMDBase,
		findUpdateBase,
		clearFolder,
		findUpdateFiles,
		executeCMDUpdate
	],
	function(err){
		if(err){
			console.log(err);
		}
	}
)

/*
 * Look for all files inside pathFiles and index them by
 name (full folder name) and version (month and year);
 * Example: folder eDNE_Basico_1506 will be 
 filesAndVersions[n][name]: eDNE_Basico_1506, filesAndVersions[n][version]: 1506;
 */
function findFilesAndVersions(findFilesAndVersionsCallback){
	var filesAndVersions = [];

	fs.readdir(pathFiles, function(err, files){
		if (err){
			findFilesAndVersionsCallback(err);
		}else{
			for (var i = 0; i < files.length; i++) {
				filesAndVersions[i] = [];
				filesAndVersions[i]["name"] = files[i];
				filesAndVersions[i]["version"] = files[i].replace(/\D/g,'');
			}

			console.log(filesAndVersions);
			findFilesAndVersionsCallback(null, filesAndVersions);
		}
	});
}

/*
 * Every time an update is made the version saved in the db is updated as well;
 * This function looks for the last update made in order to check if the actual file is a new version
 */
function verifyLastDBVersion(){
	//TODO
}

/*
 * Look for files without the 'Delta' in its name, that's the only existing criteria to find out if a file is an
 update or base file;
 * If this criteria is ever changed, all that has to be done is change he first 'if' in the first 'each' to a better approach;
 */
function findUploadBase(filesAndVersions, findUploadBaseCallback){
	var folderName = "",
		qtyOfFolders = 0;

	async.each(filesAndVersions, function(file, callback) {
		if(file["name"].indexOf("Delta") == -1 ) {
			folderName += file["name"];
			qtyOfFolders ++;
			callback(null);
		}else{
			callback(null);
		}
	}, function(err){
		if( err ) {
			findUploadBaseCallback("Erro uploadBase");
		} else {
			if(qtyOfFolders == 0){
				console.log("Nenhum arquivo base encontrado");
				findUploadBaseCallback(null, filesAndVersions, folderName);
			}
			if(qtyOfFolders > 1){
				findUploadBaseCallback("Erro! Mais de um arquivo base encontrado");
			}
			if(qtyOfFolders == 1){
				findUploadBaseCallback(null, filesAndVersions, folderName);
			}
		}
	});
}

/*
 * This is a bridge within a waterfall, to find out if a base file was found, so that no 'if' is required inside another function,
 keeping the waterfall flowing naturally
 */
function uploadBase(filesAndVersions, folderName, uploadBaseCallback){
	if(folderName == ""){
		uploadBaseCallback(null, filesAndVersions);
	}else{
		uploadBaseCallback(null, filesAndVersions, folderName);
	}
}

/*
 * If a base file was found, this should 'prepare' its files, so that every file is in the rigth pattern to use a mongo import
 * Observations: 
 * 1- As the resulting file is a comma separated values (csv), we can't let any comma be displaced;
 * 2 and 3 - remove every single and double quotes so that mongo won't get confused when importing files;
 * 4 - For every new line (\r\n) we will double quotes, so that we make every 'column' a string, avoiding unseen mistakes;
 * 5 - Final step: replace every @ for a comma;
 */
function prepareFiles(filesAndVersions, folderName, prepareFilesCallback){
	var path = pathFiles+"/"+folderName+"/Delimitado";

	fs.readdir(path, function(err, files){
		async.each(files, function(file, callback) {
			var infos = fileHeaderAndName(file),
				newData = "";

			if(file.indexOf("FAIXA") == -1 && infos.name && infos.name != ""){
				var newPath = path+"/"+file;

				fs.readFile(newPath, 'binary', function (err,data) {
					if (err) {
						return callback(err);
					}

					newData = data.replace(/,/g, '-'); // Observation 1
					newData = newData.replace(/\'/g, ''); // Observation 2
					newData = newData.replace(/\"/g, ''); // Observation 3
					newData = newData.replace(/\r\n/g, '"\n"'); // Observation 4
					newData = infos.header + '\n"' + newData.replace(/@/g, '","') + '"'; // Observation 5
					
					file = file.replace(/TXT|txt/g, 'CSV');
					var newFile = pathBase+"/"+file;
					fs.writeFile(newFile, newData, 'utf8', function (err) {
						if (err){
							return callback(err);
						}
						callback();
					});
				});
			}else{
				callback();
			}
		}, function(err){
			if( err ) {
				console.log(err);
				prepareFilesCallback("Erro ao preparar arquivos");
			} else {
				prepareFilesCallback(null, filesAndVersions, folderName);
			}
		});
	});
}

/*
 * Returns a simplified file's name and its header;
 * Example: DELTA_LOG_BAIRRO.TXT returns 'bairro' and "_id, uf, key_localidade, nome, abrev_nome";
 */
function fileHeaderAndName(fileName){
	if(fileName.indexOf("LOGRADOURO") != -1){
		return {header: "_id, uf, key_localidade, key_bairro_inicial, key_bairro_final, nome, complemento, cep, tipo, utilizacao, abrev_nome",
				name: "logradouro"};
	}
	if(fileName.indexOf("BAIRRO") != -1){
		return {header: "_id, uf, key_localidade, nome, abrev_nome",
				name: "bairro"};
	}
	if(fileName.indexOf("LOCALIDADE") != -1){
		return {header: "_id, uf, nome, cep, situacao, tipo, key_localidade, abrev_nome, mun_ibge",
				name: "localidade"};
	}

	/*
	 * An important comment should be here, but there is nothing to be said... just a dividing line.
	 */

	if(fileName.indexOf("UNID_OPER") != -1){
		return {header: "_id, uf, key_localidade, key_bairro, key_logradouro, nome, endereco, cep, caixa_postal, abrev_nome",
				name: "unidadeOperacional"};
	}
	if(fileName.indexOf("LOG_CPC") != -1){
		return {header: "_id, uf, key_localidade, nome, endereco, cep",
				name: "caixaPostalComunitaria"};
	}
	if(fileName.indexOf("GRANDE_USUARIO") != -1){
		return {header: "_id, uf, key_localidade, key_bairro, key_logradouro, nome, endereco, cep, abrev_nome",
				name: "grandeUsuario"};
	}

	return "";
}

/*
 * Goes into pathUpdate and execut the commando in each file found;
 * The command is a simple line of mongoimport, importing a csv into dbName using the
 name of the file as name for a collection;
 */
function executeCMDBase(filesAndVersions, folderName, executeCMDCallback){
	var child;

	fs.readdir(pathBase, function(err, files){
		async.each(files, function(file, callback) {
			var infos =  fileHeaderAndName(file);
			console.log("a" + file);

			child = execSync("mongoimport --db "+dbName+" --collection "+infos.name.toLowerCase()+" --type csv --headerline --file "+pathBase+"/"+file, function (error, stdout, stderr) {
				console.log('stdout: ' + stdout);
				if (error != null || stderr != "") {
					console.log('stderr: ' + stderr);
					console.log('exec error: ' + error);
					callback("Erro");
				}else{
					callback();
				}
			});
			callback();
		}, function(err){
			if( err ) {
				console.log(err);
				executeCMDCallback("Erro ao preparar arquivos");
			} else {
				console.log("saiu");
				executeCMDCallback(null, filesAndVersions, folderName);
			}
		});
	});
}

/*
 * Skippig all the base of the database, from now on everything is about its update;
 * Looks for files that doesn't have 'Delta' in its name, so that it is an update;
 * As said before, no other criteria was found;
 */
function findUpdateBase(filesAndVersions, folderName, findUpdateBaseCallback){
	var foldersName = [],
		qtyOfFolders = 0;

	async.each(filesAndVersions, function(file, callback) {
		if(file["name"].indexOf("Delta") > -1 ) {
			foldersName.push(file["name"]);
			qtyOfFolders ++;
			callback(null);
		}else{
			callback(null);
		}
	}, function(err){
		if( err ) {
			findUpdateBaseCallback("Erro uploadBase");
		} else {
			if(qtyOfFolders == 0){
				console.log("Nenhum arquivo para atualização encontrado");
				findUpdateBaseCallback(null, filesAndVersions, null);
			}
			if(qtyOfFolders > 1){
				findUpdateBaseCallback(null, filesAndVersions, foldersName);
			}
		}
	});
}

/*
 * If there's no need to save the csv generated, this should clear every file inside path;
 */
function clearFolder(filesAndVersions, foldersName, updateBaseCallback){
	console.log(foldersName);

	fs.readdir(pathFiles, function(err, files){
		if (err){
			console.log(err);
			updateBaseCallback(err);
		}else{
			async.each(files, function(file, callback){
				fs.unlink(pathFiles+"/"+file, function(err){
					callback(null);
				});
			}, function(err){
				if(err){
					console.log(err);
				}else{
					updateBaseCallback(null, filesAndVersions, foldersName);
				}
			})
		}
	});
}

/*
 * Reads each of the previous folders found in order to create all the csv files that will do the update;
 * createUpdateFiles processes and create csv files;
 */
function findUpdateFiles(filesAndVersions, foldersName, findUpdateFilesCallback){
	var infos = "";

	foldersName.sort();

	async.each(foldersName, function(folder, callback1){
		fs.readdir(pathFiles+"/"+folder+"/delimitado", function(err, files){
			async.each(files, function(file, callback){
				infos = fileHeaderAndName(file);
				if(files.indexOf("FAIXA") == -1 && infos.name && infos.name != ""){
					var t = infos.name;
					fs.readFile(pathFiles+"/"+folder+"/delimitado/"+file, 'binary', function (err,data) {
						createUpdateFiles(data, t, folder); //Important!
						callback(null);
					});
				}else{
					callback(null);
				}

			}, function(err){
				if(err){
					console.log(err);
					findUpdateFilesCallback(err);
				}else{
					callback1(null);
				}
			});
		});
	}, function(err){
		if(err){
			findUpdateFilesCallback(err);
		}else{
			findUpdateFilesCallback(null, "", filesAndVersions);
		}
	});
}

/*
 * Will process each data in order to transform this:
 -6216@MS@4141@Jardim do Zé Pereira@Jd Z Pereira@UPD
   into this:
 -db.bairro.update({_id:"6216"},{$set:{uf:"MS",key_localidade:"4141",nome:"Jardim do Zé Pereira",abrev_nome:"Jd Z Pereira"}},{upsert:true})
  * Firstly, it will transform data into an array and then send it to findUpdateValues and createQueries (see their annotations);
  * Finally the folder and files are created;
 */
function createUpdateFiles(data, fileName, folderName, createUpdateFilesCallback){
	var qtyOfAt = 0,
		queryType = "",
		dataToArray = [],
		newDataArray = [],
		newData = "";

	dataToArray = data.split("\n");
	newDataArray = findUpdateValues(dataToArray, fileName);
	newData = "use teste\n" + createQueries(newDataArray, fileName);
	fs.mkdir(pathUpdate+"/"+folderName, function(err){
		if(err && err.code != "EEXIST"){
			console.log(err.code);
			createUpdateFilesCallback(err);
		}else{
			fs.writeFile(pathUpdate+"/"+folderName+"/"+fileName+".js", newData, 'utf8', function (err) {
				if (err){
					console.log(err);
				}
			});	
		}		
	});
}

/*
 * Splits each line of dataToArray into another array, the criteria is the @
 */
function findUpdateValues(dataToArray, fileName){
	var newData = [];

	for (var i = 0; i < dataToArray.length; i++) {
		newData[i] = dataToArray[i].split("@");
	};

	newData = findACreativeNameLater(newData, fileName);
	return newData;
}

/*
 * Breaks the data into indexed arrays
 */
function findACreativeNameLater(dataToArray, fileName){
	var newData = [];

	if(fileName == "bairro"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["key_localidade"] = dataToArray[i][2];
			newData[i]["nome"] = dataToArray[i][3];
			newData[i]["abrev_nome"] = dataToArray[i][4];
			newData[i]["method"] = dataToArray[i][5];
			if(newData[i]["method"]){ newData[i]["method"] = newData[i]["method"].replace(/[\r\n]/g, ""); }
		};
	}
	if(fileName == "logradouro"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["key_localidade"] = dataToArray[i][2];
			newData[i]["key_bairro_inicial"] = dataToArray[i][3];
			newData[i]["key_bairro_final"] = dataToArray[i][4];
			newData[i]["nome"] = dataToArray[i][5];
			newData[i]["complemento"] = dataToArray[i][6];
			newData[i]["cep"] = dataToArray[i][7];
			newData[i]["tipo"] = dataToArray[i][8];
			newData[i]["utilizacao"] = dataToArray[i][9];
			newData[i]["abrev_nome"] = dataToArray[i][10];
			newData[i]["method"] = dataToArray[i][11];
		};	
	}
	if(fileName == "localidade"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["nome"] = dataToArray[i][2];
			newData[i]["cep"] = dataToArray[i][3];
			newData[i]["situacao"] = dataToArray[i][4];
			newData[i]["tipo"] = dataToArray[i][5];
			newData[i]["key_localidade"] = dataToArray[i][6];
			newData[i]["abrev_nome"] = dataToArray[i][7];
			newData[i]["mun_ibge"] = dataToArray[i][8];
			newData[i]["method"] = dataToArray[i][9];
			if(newData[i]["method"]){ newData[i]["method"] = newData[i]["method"].replace(/[\r\n]/g, ""); }
		};
	}

	if(fileName == "unidadeOperacional"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["key_localidade"] = dataToArray[i][2];
			newData[i]["key_bairro"] = dataToArray[i][3];
			newData[i]["key_logradouro"] = dataToArray[i][4];
			newData[i]["nome"] = dataToArray[i][5];
			newData[i]["endereco"] = dataToArray[i][6];
			newData[i]["cep"] = dataToArray[i][7];
			newData[i]["caixa_postal"] = dataToArray[i][8];
			newData[i]["abrev_nome"] = dataToArray[i][9];
			newData[i]["method"] = dataToArray[i][10];
		};	
	}
	if(fileName == "caixaPostalComunitaria"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["key_localidade"] = dataToArray[i][2];
			newData[i]["nome"] = dataToArray[i][3];
			newData[i]["endereco"] = dataToArray[i][4];
			newData[i]["cep"] = dataToArray[i][5];
			newData[i]["method"] = dataToArray[i][6];
		};
	}
	if(fileName == "grandeUsuario"){
		for (var i = 0; i < dataToArray.length; i++) {
			newData[i] = [];
			newData[i]["id"] = dataToArray[i][0];
			newData[i]["uf"] = dataToArray[i][1];
			newData[i]["key_localidade"] = dataToArray[i][2];
			newData[i]["key_bairro"] = dataToArray[i][3];
			newData[i]["key_logradouro"] = dataToArray[i][4];
			newData[i]["nome"] = dataToArray[i][5];
			newData[i]["endereco"] = dataToArray[i][6];
			newData[i]["cep"] = dataToArray[i][7];
			newData[i]["abrev_nome"] = dataToArray[i][8];
			newData[i]["method"] = dataToArray[i][9];
		};
	}
	
	return newData;
}

/*
 * Makes each line go through its mold, just like a cake mold;
 */
function createQueries(dataArray, fileName){
	var newData = "";

	for (var i = 0; i < dataArray.length; i++) {
		newData += queryCakeMold(dataArray[i], fileName);
	};

	return newData;
}

/*
 * First sets every mold using prepareCakeMolds;
 * Then returns only the necessary mold, the criteria here is the file's name;
 */
function queryCakeMold(data, fileName){
	var method = data["method"],
		cakeMolds = {};

	cakeMolds = prepareCakeMolds(cakeMolds, data);

	if(!cakeMolds[method]){
		return "";
	}
	return cakeMolds[method][fileName];
}

/*
 * Basically it formats a indexed array of strings using values from data, so that later I can just call the method and file I want;
 * As I didn't want to create 2 more if for each situation (method and file's name) I just set everything with data, if it doesn't
 have a value I just set it blank (which happens a lot).
 * By avoiding all the ifs I basically avoided doubling the size of this method;
 * There're better ways to solve this problem, but it involves a way more complciated logic, which would cost more time to develop,
 but way less lines, although still the same performance;
 * Flagged as something I'll rework later;
 */
function prepareCakeMolds(cakeMolds, data){
	cakeMolds["INS"] = {};
	cakeMolds["UPD"] = {};
	cakeMolds["DEL"] = {};

	//Insert
	cakeMolds["INS"]["bairro"] = 
		util.format('db.bairro.insert({_id:"%s",uf:"%s",key_localidade:"%s",nome:"%s",abrev_nome:"%s"})\n',(data["id"] || ""),
		(data["uf"] || ""), (data["key_localidade"] || ""), (data["nome"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["INS"]["logradouro"] = 
		util.format('db.logradouro.insert({_id:"%s",uf:"%s",key_localidade:"%s",key_bairro_inicial:"%s",key_bairro_final:"%s",nome:"%s",complemento:"%s",cep:"%s",tipo:"%s",utilizacao:"%s",abrev_nome:"%s"})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro_inicial"] || ""), (data["key_bairro_final"] || ""),
		(data["nome"] || ""), (data["complemento"] || ""), (data["cep"] || ""), (data["tipo"] || ""), (data["utilizacao"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["INS"]["localidade"] =
		util.format('db.localidade.insert({_id:"%s",uf:"%s",nome:"%s",cep:"%s",situacao:"%s",tipo:"%s",key_localidade:"%s",abrev_nome:"%s",mun_ibge:"%s"})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["nome"] || ""), (data["cep"] || ""), (data["situacao"] || ""), (data["tipo"] || ""), 
	(data["key_localidade"] || ""),(data["abrev_nome"] || ""), (data["mun_ibge"] || ""));
	cakeMolds["INS"]["unidadeOperacional"] =
		util.format('db.unidadeoperacional.insert({_id:"%s",uf:"%s",key_localidade:"%s",key_bairro:"%s",key_logradouro:"%s",nome:"%s",endereco:"%s",cep:"%s",caixa_postal:"%s",abrev_nome:"%s"})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro"] || ""), (data["key_logradouro"] || ""),
		(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""), (data["caixa_postal"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["INS"]["caixa_postal"] =
		util.format('db.caixapostalcomunitaria.insert({_id:"%s",uf:"%s",key_localidade:"%s",nome:"%s",endereco:"%s",cep:"%s"})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""),	(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""));
	cakeMolds["INS"]["grandeUsuario"] =
		util.format('db.grandeusuario.insert({_id:"%s",uf:"%s",key_localidade:"%s",key_bairro:"%s",key_logradouro:"%s",nome:"%s",endereco:"%s",cep:"%s",abrev_nome:"%s"})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro"] || ""), (data["key_logradouro"] || ""),
		(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""), (data["abrev_nome"] || ""));

	//Update
	cakeMolds["UPD"]["bairro"] = 
		util.format('db.bairro.update({_id:"%s"},{$set:{uf:"%s",key_localidade:"%s",nome:"%s",abrev_nome:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["nome"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["UPD"]["logradouro"] = 
		util.format('db.logradouro.update({_id:"%s"},{$set:{uf:"%s",key_localidade:"%s",key_bairro_inicial:"%s",key_bairro_final:"%s",nome:"%s",complemento:"%s",cep:"%s",tipo:"%s",utilizacao:"%s",abrev_nome:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro_inicial"] || ""), (data["key_bairro_final"] || ""),
		(data["nome"] || ""), (data["complemento"] || ""), (data["cep"] || ""), (data["tipo"] || ""), (data["utilizacao"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["UPD"]["localidade"] =
		util.format('db.localidade.update({_id:"%s"},{$set:{uf:"%s",nome:"%s",cep:"%s",situacao:"%s",tipo:"%s",key_localidade:"%s",abrev_nome:"%s",mun_ibge:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["nome"] || ""), (data["cep"] || ""), (data["situacao"] || ""), (data["tipo"] || ""), 
		(data["key_localidade"] || ""),(data["abrev_nome"] || ""), (data["mun_ibge"] || ""));
	cakeMolds["UPD"]["unidadeOperacional"] =
		util.format('db.unidadeoperacional.update({_id:"%s"},{$set:{uf:"%s",key_localidade:"%s",key_bairro:"%s",key_logradouro:"%s",nome:"%s",endereco:"%s",cep:"%s",caixa_postal:"%s",abrev_nome:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro"] || ""), (data["key_logradouro"] || ""),
		(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""), (data["caixa_postal"] || ""), (data["abrev_nome"] || ""));
	cakeMolds["UPD"]["caixa_postal"] =
		util.format('db.caixapostalcomunitaria.update({_id:"%s"},{$set:{uf:"%s",key_localidade:"%s",nome:"%s",endereco:"%s",cep:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""),	(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""));
	cakeMolds["UPD"]["grandeUsuario"] =
		util.format('db.grandeusuario.update({_id:"%s"},{$set:{uf:"%s",key_localidade:"%s",key_bairro:"%s",key_logradouro:"%s",nome:"%s",endereco:"%s",cep:"%s",abrev_nome:"%s"}},{upsert:true})\n',
		(data["id"] || ""), (data["uf"] || ""), (data["key_localidade"] || ""), (data["key_bairro"] || ""), (data["key_logradouro"] || ""),
		(data["nome"] || ""), (data["endereco"] || ""), (data["cep"] || ""), (data["abrev_nome"] || ""));

	//Delete
	cakeMolds["DEL"]["bairro"] = 
		util.format('db.bairro.remove({_id:"%s"})\n',
		(data["id"] || ""));
	cakeMolds["DEL"]["logradouro"] = 
		util.format('db.logradouro.remove({_id:"%s"})\n',
		(data["id"] || ""));
	cakeMolds["DEL"]["localidade"] =
		util.format('db.localidade.remove({_id:"%s"})\n',
		(data["id"] || ""));
	cakeMolds["DEL"]["unidadeOperacional"] =
		util.format('db.unidadeoperacional.remove({_id:"%s"})\n',
		(data["id"] || ""));
	cakeMolds["DEL"]["caixa_postal"] =
		util.format('db.caixapostalcomunitaria.remove({_id:"%s"})\n',
		(data["id"] || ""));
	cakeMolds["DEL"]["grandeUsuario"] =
		util.format('db.grandeusuario.remove({_id:"%s"})\n',
		(data["id"] || ""));

	return cakeMolds;
}

/*
 * For each folder and file in filesAndVersions, which won't include the base files if it exists, the command 'mongo <'
 will be executed;
 */
function executeCMDUpdate(path, filesAndVersions, executeCMDUpdateCallback){
	async.each(filesAndVersions, function(file, callback1) {
		fs.readdir(pathFiles+file["name"], function(err, files){
			async.each(files, function(queries, callback) {
				var infos =  fileHeaderAndName(queries);
				child = execSync("mongo < "+pathFiles+file["name"]+"/"+queries, function (error, stdout, stderr) {
					if (error !== null || stderr !== "") {
						console.log('stderr: ' + stderr);
						console.log('exec error: ' + error);
						callback("Erro");
					}else{
						console.log(queries);
						callback(null);
					}
				});
				console.log(queries);
				callback(null);
			}, function(err){
				if( err ) {
					console.log(err);
					callback1(err);
				} else {
					callback1(null);
				}
			});
		});
	}, function(err){
		if(err){
			executeCMDUpdateCallback("Erro ao preparar arquivos");
		}else{
			executeCMDUpdateCallback(null);
		}
	});
}
