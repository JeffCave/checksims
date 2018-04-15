/*
 * CDDL HEADER START
 *
 * The contents of this file are subject to the terms of the
 * Common Development and Distribution License (the "License").
 * You may not use this file except in compliance with the License.
 *
 * See LICENSE.txt included in this distribution for the specific
 * language governing permissions and limitations under the License.
 *
 * CDDL HEADER END
 *
 * Copyright (c) 2014-2015 Nicholas DeMarinis, Matthew Heon, and Dolan Murvihill
 */
'use strict';
export {
	TokenList
};

import {LexemeMap} from '../token/LexemeMap.js';
import {checkNotNull,checkArgument} from '../util/misc.js';

/**
 * A list of tokens of a specific type.
 */
export default class TokenList extends Array{
	/**
	 * Create a TokenList accepting a specific type of token.
	 *
	 * @param type Type of token which will be allowed in the list
	 */
	constructor(type=null, baseList=null) {
		super();

		checkNotNull(type);

		let isType = Object.values(TokenList.TokenTypes).some(function(t){
			return type === t;
		});
		checkArgument(isType,"Expected type to be of TokenType. Received " + type);

		if(Array.isArray(baseList)){
			let the = this;
			baseList.forEach(function(d){
				the.push(d);
			});
		}

		this.type = type;
	}

	static get TokenTypes(){
		return {
			CHARACTER: "character",
			WHITESPACE: "whitespace",
			LINE: "line"
		};
	}

	/**
	 * Join each token in the list in order, using a tokenization-appropriate separating character.
	 *
	 * @param onlyValid If true, ignore invalid tokens when joining
	 * @return String composed of each element in the token list, in order, separated by appropriate character
	 */
	join(sepChar = null, onlyValid = false) {
		if(this.length == 0) {
			return "";
		}

		if(typeof(sepChar) === 'boolean'){
			let swap = onlyValid;
			onlyValid = sepChar;
			sepChar = swap;
		}

		if(sepChar === null || sepChar === false){
			switch(this.type) {
				case TokenList.TokenTypes.CHARACTER: sepChar = ""; break;
				case TokenList.TokenTypes.WHITESPACE: sepChar = " "; break;
				case TokenList.TokenTypes.LINE: sepChar = "\n"; break;
				default: sepChar = ""; break;
			}
		}
		let b = Array.from(this)
			// TODO: This should not be necessary. Find a way to prevent NULL insertion to the list
			.filter(function(d){
				let keep = (d || false) !== false;
				return keep;
			})
			.map(function(token){
				if(!onlyValid || token.valid) {
					return LexemeMap[token.lexeme];
				}
			})
			.join(sepChar)
			;

		return b;
	}

	concat(tokenList){
		checkArgument(tokenList instanceof Array,"Token list can only accept token lists");
		let list = new TokenList(this.type);
		this.forEach(function(d){list.push(d);});
		tokenList.forEach(function(d){list.push(d);});
		return list;
	}

	/**
	 * Peforms a deep copy of a TokenList, returning an immutable version of the initial list with immutable tokens.
	 *
	 * @param cloneFrom List to copy
	 * @return Immutable copy of cloneFrom
	 */
	static immutableCopy(cloneFrom) {
		checkNotNull(cloneFrom);
		checkArgument(cloneFrom instanceof TokenList,'Parameter `cloneFrom` must be instance of type `TokeList`');
		let tmp = Array.from(cloneFrom).slice(0);
		return new TokenList(cloneFrom.type, tmp);
	}

	/**
	 * Perform a deep copy of a TokenList.
	 *
	 * TODO add a copy constructor as well
	 *
	 * @param cloneFrom List to deep copy
	 * @return Cloned copy of the tokenization list
	 */
	static cloneTokenList(cloneFrom) {
		checkNotNull(cloneFrom);
		let cloned = cloneFrom.clone();
		return cloned;
	}

	clone(){
		let newList = Array.from(this)
			.map(function(token){
				return JSON.clone(token);
			});
		newList = new TokenList(this.type, newList);
		return newList;
	}

	/**
	 * TODO: This depth of equality checking seems superfluous to me. Check to see that it is required by the algorithm.
	 */
	equals(other) {
		if(!(other instanceof TokenList)) {
			return false;
		}
		if(other.type !== this.type){
			return false;
		}
		if(other.length !== this.length){
			return false;
		}

		other = Array.from(other).map(function(token){
			return token.lexeme;
		});
		let areSame = Array.from(this).every(function(token){
			let lexeme = token.lexeme;
			let index = other.indexOf(lexeme);
			if(0 > index){
				return false;
			}
			other.splice(index,1);
			return true;
		});
		if(!areSame || other.length > 0){
			return false;
		}

		return true;
	}

	toString() {
		let str = JSON.stringify(this);
		return str;
	}

	static fromString(str){
		let list = JSON.parse(str);
		list = new TokenList(list.type,list);
		return list;
	}

	hashCode() {
		return this.type.hashCode() ^ super.hashCode();
	}

	numValid() {
		return Number.parseInt(this.filter(function(d){ return d.isValid();}).length,10);
	}

	size(){
		console.warn('DEPRECATED: use "length" instead');
		return this.length;
	}
}
