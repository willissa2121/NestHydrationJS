'use strict';

function nestHydrationJS() {
	var NestHydrationJS, _;

	var isArray = require('lodash.isarray');
	var isFunction = require('lodash.isfunction');
	var keys = require('lodash.keys');
	var values = require('lodash.values');
	var isPlainObject = require('lodash.isplainobject');

	NestHydrationJS = {};

	NestHydrationJS.typeHandlers = {
		NUMBER: function (cellValue) {
			return parseFloat(cellValue);
		},
		BOOLEAN: function (cellValue) {
			return cellValue == true;
		}
	};

	NestHydrationJS.nest = function (data, structPropToColumnMap) {
		var listOnEmpty, table, meta, struct, i, row, j, _nest, primeIdColumn;

		listOnEmpty = false;

		if (typeof structPropToColumnMap === 'undefined') {
			structPropToColumnMap = null;
		}

		if (data === null) {
			return null;
		}

		if (!isArray(structPropToColumnMap) && !isPlainObject(structPropToColumnMap) && structPropToColumnMap !== null && structPropToColumnMap !== true) {
			throw new Error('nest expects param structPropToColumnMap to be an array, plain object, null, or true');
		}

		if (isPlainObject(data)) {
			table = [data];
		} else if (isArray(data)) {
			table = data;
		} else {
			throw Error('nest expects param data to be in the form of a plain object or an array of plain objects (forming a table)');
		}

		if (structPropToColumnMap === true) {
			listOnEmpty = true;
			structPropToColumnMap = null;
		}

		if (structPropToColumnMap === null && table.length > 0) {
			structPropToColumnMap = NestHydrationJS.structPropToColumnMapFromColumnHints(keys(table[0]));
		}

		if (structPropToColumnMap === null) {
			return listOnEmpty ? [] : null;
		} else if (table.length === 0) {
			return isArray(structPropToColumnMap) ? [] : null;
		}

		meta = NestHydrationJS.buildMeta(structPropToColumnMap);

		_nest = function (row, idColumn) {
			var value, objMeta, obj, k, containingId, container, cell, cellValue, valueTypeFunction;

			value = row[idColumn];

			objMeta = meta.idMap[idColumn];

			if (value === null) {
				if (objMeta.default !== null && typeof objMeta.default !== 'undefined') {
					value = objMeta.default;
				} else {
					return;
				}
			}

			if (typeof objMeta.cache[value] !== 'undefined') {
				if (objMeta.containingIdUsage === null) {
					return;
				}

				containingId = row[objMeta.containingColumn];
				if (typeof objMeta.containingIdUsage[value] !== 'undefined' && typeof objMeta.containingIdUsage[value][containingId] !== 'undefined') {
					return;
				}

				obj = objMeta.cache[value];
			} else {
				obj = {};
				objMeta.cache[value] = obj;

				for (k = 0; k < objMeta.valueList.length; k++) {
					cell = objMeta.valueList[k];
					cellValue = row[cell.column];
					if (cellValue !== null) {
						if (isFunction(cell.type)) {
							valueTypeFunction = cell.type;
						} else {
							valueTypeFunction = NestHydrationJS.typeHandlers[cell.type];
						}
						if (valueTypeFunction) {
							cellValue = valueTypeFunction(cellValue, cell.column, row);
						}
					} else if (typeof cell.default !== 'undefined') {
						cellValue = cell.default;
					}

					obj[cell.prop] = cellValue;
				}

				for (k = 0; k < objMeta.toManyPropList.length; k++) {
					obj[objMeta.toManyPropList[k]] = [];
				}

				for (k = 0; k < objMeta.toOneList.length; k++) {
					obj[objMeta.toOneList[k].prop] = null;
					_nest(row, objMeta.toOneList[k].column);
				}
			}

			if (objMeta.containingColumn === null) {
				if (objMeta.isOneOfMany) {
					if (struct === null) {
						struct = [];
					}
					struct.push(obj);
				} else {
					struct = obj;
				}
			} else {
				containingId = row[objMeta.containingColumn];
				container = meta.idMap[objMeta.containingColumn].cache[containingId];

				if (container) {
					if (objMeta.isOneOfMany) {
						container[objMeta.ownProp].push(obj);
					} else {
						container[objMeta.ownProp] = obj;
					}
				}

				if (typeof objMeta.containingIdUsage[value] === 'undefined') {
					objMeta.containingIdUsage[value] = {};
				}
				objMeta.containingIdUsage[value][containingId] = true;
			}
		};

		struct = null;

		for (i = 0; i < table.length; i++) {
			row = table[i];

			for (j = 0; j < meta.primeIdColumnList.length; j++) {
				primeIdColumn = meta.primeIdColumnList[j];

				_nest(row, primeIdColumn);
			}
		}

		return struct;
	};

	NestHydrationJS.buildMeta = function (structPropToColumnMap) {
		var meta, _buildMeta, primeIdColumn;

		_buildMeta = function (structPropToColumnMap, isOneOfMany, containingColumn, ownProp) {
			var propList, idProp, idColumn, i, prop, objMeta, subIdColumn;

			propList = keys(structPropToColumnMap);
			if (propList.length === 0) {
				throw new Error('invalid structPropToColumnMap format - property \'' + ownProp + '\' can not be an empty array');
			}

			for (i = 0; i < propList.length; i++) {
				prop = propList[i];
				if (structPropToColumnMap[prop].id === true) {
					idProp = prop;
					break;
				}
			}

			if (idProp === undefined) {
				idProp = propList[0];
			}

			idColumn = structPropToColumnMap[idProp].column || structPropToColumnMap[idProp];

			if (isOneOfMany) {
				meta.primeIdColumnList.push(idColumn);
			}

			objMeta = {
				valueList: [],
				toOneList: [],
				toManyPropList: [],
				containingColumn: containingColumn,
				ownProp: ownProp,
				isOneOfMany: isOneOfMany === true,
				cache: {},
				containingIdUsage: containingColumn === null ? null : {},
				default: typeof structPropToColumnMap[idProp].default === 'undefined' ? null : structPropToColumnMap[idProp].default
			};

			for (i = 0; i < propList.length; i++) {
				prop = propList[i];
				if (typeof structPropToColumnMap[prop] === 'string') {
					objMeta.valueList.push({
						prop: prop,
						column: structPropToColumnMap[prop],
						type: undefined,
						default: undefined
					});
				} else if (structPropToColumnMap[prop].column) {
					objMeta.valueList.push({
						prop: prop,
						column: structPropToColumnMap[prop].column,
						type: structPropToColumnMap[prop].type,
						default: structPropToColumnMap[prop].default
					});
				} else if (isArray(structPropToColumnMap[prop])) {
					objMeta.toManyPropList.push(prop);

					_buildMeta(structPropToColumnMap[prop][0], true, idColumn, prop);
				} else if (isPlainObject(structPropToColumnMap[prop])) {

					subIdColumn = values(structPropToColumnMap[prop])[0];
					if (typeof subIdColumn === 'undefined') {
						throw new Error('invalid structPropToColumnMap format - property \'' + prop + '\' can not be an empty object');
					}

					if (subIdColumn.column) {
						subIdColumn = subIdColumn.column;
					}

					objMeta.toOneList.push({
						prop: prop,
						column: subIdColumn
					});
					_buildMeta(structPropToColumnMap[prop], false, idColumn, prop);
				} else {
					throw new Error('invalid structPropToColumnMap format - property \'' + prop + '\' must be either a string, a plain object or an array');
				}
			}

			meta.idMap[idColumn] = objMeta;
		};

		meta = {
			primeIdColumnList: [],
			idMap: {}
		};

		if (isArray(structPropToColumnMap)) {
			if (structPropToColumnMap.length !== 1) {
				throw new Error('invalid structPropToColumnMap format - can not have multiple roots for structPropToColumnMap, if an array it must only have one item');
			}

			_buildMeta(structPropToColumnMap[0], true, null, null);
		} else if (isPlainObject(structPropToColumnMap)) {
			primeIdColumn = values(structPropToColumnMap)[0];
			if (typeof primeIdColumn === 'undefined') {
				throw new Error('invalid structPropToColumnMap format - the base object can not be an empty object');
			}

			if (typeof primeIdColumn !== 'string') {
				primeIdColumn = primeIdColumn.column;
			}

			meta.primeIdColumnList.push(primeIdColumn);

			_buildMeta(structPropToColumnMap, false, null, null);
		}

		return meta;
	};

	NestHydrationJS.structPropToColumnMapFromColumnHints = function (columnList, renameMapping) {
		var propertyMapping, prop, i, columnType, type, isId, column, pointer, navList, j, nav, renamedColumn, prevKeyList, k;

		if (typeof renameMapping === 'undefined') {
			renameMapping = {};
		}

		propertyMapping = { base: null };

		for (i = 0; i < columnList.length; i++) {
			column = columnList[i];

			columnType = column.split('___');

			type = null;
			isId = false;
			for (j = 1; j < columnType.length; j++) {
				if (columnType[j] === 'ID') {
					isId = true;
				} else if (typeof NestHydrationJS.typeHandlers[columnType[j]] !== 'undefined') {
					type = columnType[j];
				}
			}

			pointer = propertyMapping;
			prop = 'base';

			navList = columnType[0].split('_');

			for (j = 0; j < navList.length; j++) {
				nav = navList[j];

				if (nav === '') {
					if (pointer[prop] === null) {
						pointer[prop] = [null];
					}
					pointer = pointer[prop];
					prop = 0;
				} else {
					if (pointer[prop] === null) {
						pointer[prop] = {};
					}
					if (typeof pointer[prop][nav] === 'undefined') {
						renamedColumn = typeof renameMapping[column] === 'undefined' ? column : renameMapping[column];
						if (type !== null || isId) {
							renamedColumn = { column: renamedColumn };
						}
						if (type !== null) {
							renamedColumn.type = type;
						}
						if (isId) {
							renamedColumn.id = true;

							prevKeyList = keys(pointer[prop]);
							for (k = 0; k < prevKeyList.length; k++) {
								if (pointer[prop][prevKeyList[k]].id === true) {
									return 'invalid - multiple id - ' + pointer[prop][prevKeyList[k]].column + ' and ' + renamedColumn.column + ' conflict';
								}
							}
						}
						pointer[prop][nav] = j === navList.length - 1 ? renamedColumn : null;
					}
					pointer = pointer[prop];
					prop = nav;
				}
			}
		}

		return propertyMapping.base;
	};

	NestHydrationJS.registerType = function (name, handler) {
		if (NestHydrationJS.typeHandlers[name]) {
			throw new Error('Handler with type, ' + name + ', already exists');
		}

		NestHydrationJS.typeHandlers[name] = handler;
	};
	return NestHydrationJS;
}
module.exports = nestHydrationJS;