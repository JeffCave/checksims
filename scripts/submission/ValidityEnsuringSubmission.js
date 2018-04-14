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
	ValidityEnsuringSubmission
};

import {TokenList} from '../token/TokenList.js';
import {ValidityEnsuringToken} from '../token/ValidityEnsuringToken.js';
import {Submission} from '../submission/Submission.js';
import {checkArgument} from '../util/misc.js';

/**
 * Submission which enforces token validity - two tokens, even if
 * invalid, are not considered equal.
 *
 * Decorates another submission and overrides equals()
 */
export default class ValidityEnsuringSubmission extends Submission {
	constructor(submission) {
		checkArgument(submission instanceof Submission, "Expected an instance of 'Submission'");
		super(submission);
	}

	async equals(other) {
		if(!(other instanceof Submission)) {
			return false;
		}

		// just declare two values to be used when we need
		// too fetch values for clarity
		let a,b,areEqual;

		areEqual =
			other.getTokenType() !== this.getTokenType()
			|| other.getName() !== this.getName()
			|| other.NumTokens !== this.NumTokens
			;
		if(areEqual){
			return false;
		}

		a = await this.getContentAsString;
		b = await other.getContentAsString;
		if(a !== b){
			return false;
		}

		let thisList = this.ContentAsTokens.map((d)=> new ValidityEnsuringToken(d));
		thisList = new TokenList(this.getTokenType(),thisList);

		let otherList = other.ContentAsTokens.map((d)=> new ValidityEnsuringToken(d));
		otherList = new TokenList(this.getTokenType(),otherList);

		return thisList.equals(otherList);
	}

	hashCode() {
		return super.hashCode();
	}
}
