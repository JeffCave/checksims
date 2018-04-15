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
	LineSimilarityChecker
};

import {AlgorithmResults} from '../../algorithm/AlgorithmResults.js';
import {SimilarityDetector} from '../../algorithm/SimilarityDetector.js';
import {Submission} from '../../submission/Submission.js';
import {TokenList} from '../../token/TokenList.js';
import {LexemeMap} from '../../token/LexemeMap.js';
import {checkNotNull, checkArgument, hasher} from '../../util/misc.js';

/**
 * Implements a line-by-line similarity checker.
 */
class LineSimilarityChecker extends SimilarityDetector {

	static getInstance() {
		if(!('instance' in LineSimilarityChecker)){
			LineSimilarityChecker.instance = new LineSimilarityChecker();
		}

		return LineSimilarityChecker.instance;
	}

	getName() {
		return "linecompare";
	}

	/**
	 * Detect similarities using line similarity comparator.
	 *
	 * @param a First submission to check
	 * @param b Second submission to check
	 * @return Results of the similarity detection
	 * @throws TokenTypeMismatchException Thrown comparing two submissions with different token types
	 * @throws InternalAlgorithmError Thrown on error obtaining a hash algorithm instance
	 */
	async detectSimilarity(a, b){
		checkNotNull(a);
		checkNotNull(b);
		checkArgument(a instanceof Submission, "Expecting to compare Submissions (a is " + (typeof a) + ")");
		checkArgument(b instanceof Submission, "Expecting to compare Submissions (b is " + (typeof b) + ")");

		let linesA = await a.ContentAsTokens;
		let linesB = await b.ContentAsTokens;
		let finalA = await TokenList.cloneTokenList(linesA);
		let finalB = await TokenList.cloneTokenList(linesB);

		let isEqual = await a.equals(b);
		if(isEqual) {
			finalA.forEach((token) => token.setValid(false));
			finalB.forEach((token) => token.setValid(false));
			return AlgorithmResults(a, b, finalA, finalB);
		}


		// Create a line database map
		// Per-method basis to ensure we have no mutable state in the class
		let lineDatabase = {};

		// Hash all lines in A, and put them in the lines database
		this.addLinesToMap(linesA, lineDatabase, a, hasher);

		// Hash all lines in B, and put them in the lines database
		this.addLinesToMap(linesB, lineDatabase, b, hasher);

		// Number of matched lines contained in both
		let identicalLinesA = 0;
		let identicalLinesB = 0;

		// Check all the keys
		Object.values(lineDatabase).forEach(function(val){
			// If more than 1 line has the hash...
			if(val.length !== 1) {
				let numLinesA = 0;
				let numLinesB = 0;

				// Count the number of that line in each submission
				val.forEach(function(s){
					if(s.submission.equals(a)) {
						numLinesA++;
					}
					else if(s.submission.equals(b)) {
						numLinesB++;
					}
					else {
						throw new Error("Unreachable code!");
					}
				});

				if(numLinesA == 0 || numLinesB == 0) {
					// Only one of the submissions includes the line - no plagiarism here
					return;
				}

				// Set matches invalid
				val.forEach(function(s){
					if(s.submission.equals(a)) {
						finalA[s.lineNum].setValid(false);
					}
					else if(s.submission.equals(b)) {
						finalB[s.lineNum].setValid(false);
					}
					else {
						throw new Error("Unreachable code!");
					}
				});

				identicalLinesA += numLinesA;
				identicalLinesB += numLinesB;
			}
		});

		let invalTokensA = Array.from(finalA).filter((token) => !token.valid).length;
		let invalTokensB = Array.from(finalB).filter((token) => !token.valid).length;

		if(invalTokensA !== identicalLinesA) {
			throw new Error(
				"Internal error: number of identical tokens (" + identicalLinesA
				+ ") does not match number of invalid tokens (" + invalTokensA + ")"
			);
		}
		else if(invalTokensB !== identicalLinesB) {
			throw new Error(
				"Internal error: number of identical tokens (" + identicalLinesB
				+ ") does not match number of invalid tokens (" + invalTokensB + ")"
				);
		}

		let results = AlgorithmResults(a, b, finalA, finalB);
		return results;
	}

	addLinesToMap(lines, lineDatabase, submitter, hasher) {
		lines.forEach(function(token,i){
			let hash = hasher(LexemeMap[token.lexeme]);
			if(!(hash in lineDatabase)) {
				lineDatabase[hash] = [];
			}

			let line = {lineNum:i, submission:submitter};
			lineDatabase[hash].push(line);
		});
	}
}
