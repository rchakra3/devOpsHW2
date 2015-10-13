var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	
	var filePath = args[0];

	constraints(filePath);

	generateTestCases(filePath)

}

var engine = Random.engines.mt19937().autoSeed();

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue)(engine);
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}

function fakeDemo()
{
	// console.log( faker.phone.phoneNumber() );
	// console.log( faker.phone.phoneNumberFormat() );
	// console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	
  	nonEmptyDir: 
  	{
    	'nonEmptyPath':
    	{
    		'some-file.txt': 'file content here'
		}
	},
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		}
	},
	fileWithoutContent:
	{
		pathContent: 
		{	
  			file2: '',
		}
	}
};

function generateTestCases(fileToTest)
{

	var content = "var subject = require('./"+fileToTest+"')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		
		var params = {};

		var empty_string = '\'\'';

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			// params[paramName] = ['\'' + faker.phone.phoneNumber()+'\''];
			params[paramName] = [];
			// params[paramName] = '\'\'';
		}

		//console.log( params );

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...

		//If true, this will generate a file with some content
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });

		var constraintsOnFileContents = _.filter(constraints, {kind: 'fileWithContent' });

		//all the idents that need a fileWithContent
		var fileWithContentList = []
		if(constraintsOnFileContents.length)
			constraintsOnFileContents.forEach(function(constraint){
				if(constraint.ident)
				{
					fileWithContentList.push(constraint.ident);
				}
			})

		//If true, this will generate an empty directory
		var pathExists      = _.some(constraints, {kind: 'fileOrDirExists' });

		var constraintsOnFileOrDirExists = _.filter(constraints, {kind: 'fileOrDirExists' });
		
		//all the idents that can be satisifed by either a file or a directory
		var fileOrDirExistsList = []
		if(constraintsOnFileOrDirExists.length)
			constraintsOnFileOrDirExists.forEach(function(constraint){
				if(constraint.ident)
				{
					fileOrDirExistsList.push(constraint.ident);
				}
			})

		var constraintOnObject = _.filter(constraints, {kind: 'object' });
		var objectList = []
		if(constraintOnObject.length)
			constraintOnObject.forEach(function(constraint){
				if(constraint.ident)
				{
					objectList.push(constraint.ident);
				}
			})

		var constraintOnBoolean = _.filter(constraints, {kind: 'boolean' });
		var booleanList = []
		if(constraintOnBoolean.length)
			constraintOnBoolean.forEach(function(constraint){
				if(constraint.ident)
				{
					booleanList.push(constraint.ident);
				}
			})

		var non_function_variables_indexes = []

		// plug-in values for parameters
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				//Now for all those idents which need fileOrDir but also need a FileWithContent, change their value to a file
				if(_.contains(fileWithContentList, constraint.ident) && _.contains(fileOrDirExistsList, constraint.ident))
				{
					if (constraint.value == "'path/fileExists'")
						continue;
				}

				if(_.contains(objectList, constraint.ident) && _.contains(booleanList, constraint.ident))
				{
					if (constraint.kind=="boolean")
						continue;
				}

				params[constraint.ident].push(constraint.value);
				//params[constraint.ident] = (constraint.value);
			}

			else{
				//This is a contraint on a variable that is not a function parameter
				//Lets just assign the function parameter this contraint value
				//Assuming the variable is derived from a function parameter, this might just work
				non_function_variables_indexes.push(c);
			}
		}
		
		for(var i=0;i<non_function_variables_indexes.length;i++)
		{
			constraint = constraints[i];

			for (var property in params) {
			    if (params.hasOwnProperty(property)) {
			    	var dummy_value = faker.phone.phoneNumber(faker.definitions.phone_number.formats[0]);
			        var value_list = params[property];
			        if(value_list.length)
			        {
			        	var first_value = value_list[0];
			        	if(typeof(first_value)!='string')
			        		continue;
			        }
			        else{
			        	params[property].push("\""+dummy_value+"\"");
			        	//This is going be assigned a phone number Anyway
			        	//Hardcoding replacing area code. This pains me. Need to go through the faker phonenumber code to fix this
			        	var len = constraint.value.length;
			        	// if(len <=dummy_value.length)
			        	// {
		        		// console.log("Actual Value:"+constraint.value);
		        		// console.log("Before:"+dummy_value);
		        		dummy_value = constraint.value + dummy_value.substring(len);
		        		// console.log("After:"+dummy_value);
			        	// }
			        	// else{
			        	// 	dummy_value = constraint.value;
			        	// }
			        	params[property].push("\""+dummy_value+"\"");
			        }
			        
			    }
			}
		}


		var arg_combinations = generateCombinations(params);

		arg_combinations.forEach(function(args){

			if( pathExists || fileWithContent )
			{
				content += generateMockFsTestCases(pathExists,fileWithContent,!fileWithContent,true, funcName, args);
				// Bonus...generate constraint variations test cases....
				content += generateMockFsTestCases(!pathExists,fileWithContent,!fileWithContent,false, funcName, args);
				content += generateMockFsTestCases(pathExists,!fileWithContent,fileWithContent,true, funcName, args);
				content += generateMockFsTestCases(!pathExists,!fileWithContent,fileWithContent,false, funcName, args);
			}
			else
			{
				// Emit simple test case.
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		})

	}

	fs.writeFileSync('test.js', content, "utf8");
}

function generateCombinations(args_map)
{
	key_list = []

	// console.log(args_map);

	for (var key in args_map) {
		key_list.push(key);
		
	}

	queue = [];

	first_key_values = args_map[key_list[0]];

	for(i in first_key_values)
	{
		queue.push(first_key_values[i]);
	}

	var default_param = "'"+faker.phone.phoneNumber()+"'";

	if(queue.length==0)
	{
		queue.push(default_param);
	}


	for(var i=1;i<key_list.length;i++)
	{
		old_q = queue.slice(0);
		queue = []

		curr_key = key_list[i];
		curr_vals = args_map[curr_key];

		if(curr_vals.length == 0)
		{
			curr_vals.push(default_param);
		}

		while(old_q.length>0)
		{
			str = old_q.shift();

			if(typeof(str)!='string')
			{
				if(typeof(str)=='object')
				{
					str = JSON.stringify(str);
				}
				else
				{
					str = str.toString();
				}
			}

			for(var j=0;j<curr_vals.length;j++)
			{
				temp_str = str.slice(0);
				var next_val = curr_vals[j];
				if(typeof(next_val)=='object')
				{
					next_val = JSON.stringify(next_val);
				}
				temp_str += ',' + next_val;
				queue.push(temp_str);
			}
		}

	}
	if (queue.length == 0)
	{
		str = default_param;
		for(var i=1;i<key_list.length;i++)
		{
			str+= ',' + default_param;
		}
		queue.push(str);

	}
	// console.log(queue);
	return queue;

}

function generateMockFsTestCases (pathExists,fileWithContent,fileWithoutContent,nonEmptyDir, funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	if( fileWithoutContent )
	{
		for (var attrname in mockFileLibrary.fileWithoutContent) { mergedFS[attrname] = mockFileLibrary.fileWithoutContent[attrname]; }
	}
	if ( nonEmptyDir)
	{
		for (var attrname in mockFileLibrary.nonEmptyDir) { mergedFS[attrname] = mockFileLibrary.nonEmptyDir[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			// console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier')
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])


						if(params.indexOf( child.left.name ) > -1)
						{
							if(!isNaN(parseInt(rightHand))){
								functionConstraints[funcName].constraints.push( 
									new Constraint(
									{
										ident: child.left.name,
										value: rightHand,
										funcName: funcName,
										kind: "integer",
										operator : child.operator,
										expression: expression
									}));
							}
							else if(!isNaN(parseFloat(rightHand))){
								functionConstraints[funcName].constraints.push( 
									new Constraint(
									{
										ident: child.left.name,
										value: parseFloat(rightHand) + 1,
										funcName: funcName,
										kind: "integer",
										operator : child.operator,
										expression: expression
									}));

								functionConstraints[funcName].constraints.push( 
									new Constraint(
									{
										ident: child.left.name,
										value: parseFloat(rightHand) -1,
										funcName: funcName,
										kind: "integer",
										operator : child.operator,
										expression: expression
									}));
							}
							else{
								functionConstraints[funcName].constraints.push( 
									new Constraint(
									{
										ident: child.left.name,
										value: "\"" + rightHand.replace(/['"]+/g, '').concat("1") + "\"",
										funcName: funcName,
										kind: "string",
										operator : child.operator,
										expression: expression
									}));
								
								functionConstraints[funcName].constraints.push( 
									new Constraint(
									{
										ident: child.left.name,
										value: rightHand,
										funcName: funcName,
										kind: "string",
										operator : child.operator,
										expression: expression
									}));
							}
						}

						else{
							//This is not a function parameter
							//This is a contraint on a variable that is not a function parameter
							//Lets just assign the function parameter this contraint value
							//Assuming the variable is derived from a function parameter, this might just work
							functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: child.left.name,
									value: rightHand.replace(/['"]+/g, ''),
									funcName: funcName,
									kind: "string",
									operator : child.operator,
									expression: expression
								}));
						}
					}

				}

				else if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseFloat(rightHand) -1,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseFloat(rightHand),
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));
					}

				}

				else if( child.type === 'BinaryExpression' && child.operator == ">")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseFloat(rightHand)+1,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseFloat(rightHand),
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));
					}

				}

				else if( child.type === 'UnaryExpression' && child.operator=="!")
				{
					// console.log(child);
					if(child.argument.type == 'Identifier')
					{
						// console.log(child.argument.name);
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.argument.name,
								value: true,
								funcName: funcName,
								kind: "boolean",
								operator : child.operator,
								expression: expression
							}));
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.argument.name,
								value: false,
								funcName: funcName,
								kind: "boolean",
								operator : child.operator,
								expression: expression
							}));
					}

					else if(child.argument.type == 'MemberExpression')
					{
						if(child.argument.object)
						{
							if(child.argument.property)
							{
								var ident_val = child.argument.property.name
								var obj1 = new Object;
								obj1[ident_val] = true;
								var obj2 = new Object;
								obj2[ident_val] = false;
								functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: child.argument.object.name,
									value: obj1,
									funcName: funcName,
									kind: "object",
									operator : child.operator,
									expression: expression
								}));

								functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: child.argument.object.name,
									value: obj2,
									funcName: funcName,
									kind: "object",
									operator : child.operator,
									expression: expression
								}));
							}
						}
					}

				}


				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));

							//also one without any data
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file2'",
								funcName: funcName,
								kind: "fileWithoutContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}


				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="indexOf" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.callee.object.name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: child.callee.object.name,
									value:   "\"" + child.arguments[0].value +  "\"",
									funcName: funcName,
									kind: "string",
									operator : child.operator,
									expression: expression
								}));
							functionConstraints[funcName].constraints.push( 
								new Constraint(
								{
									ident: child.callee.object.name,
									value:   "\"\"",
									funcName: funcName,
									kind: "string",
									operator : child.operator,
									expression: expression
								}));
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								// A fake path to a file
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileOrDirExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}
				
				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="readdirSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								// A fake path to a file
								value:  "'nonEmptyPath'",
								funcName: funcName,
								kind: "nonEmptyDirExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

			});

		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();
