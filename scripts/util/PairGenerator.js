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
 * When distributing Covered Code, include this CDDL HEADER in each
 * file and include the License file at LICENSE.txt.
 * If applicable, add the following below this CDDL HEADER, with the
 * fields enclosed by brackets "[]" replaced with your own identifying
 * information: Portions Copyright [yyyy] [name of copyright owner]
 *
 * CDDL HEADER END
 *
 * Copyright (c) 2014-2015 Nicholas DeMarinis, Matthew Heon, and Dolan Murvihill
 */

'use strict';

import { Submission } from '/scripts/submission/Submission.js';
import { ChecksimsException } from '/scripts/ChecksimsException.js';
import { checkNotNull, checkArgument, Pair } from '/scripts/util/misc.js';

/**
 * Generates unordered pairs of submissions.
 */
class PairGenerator {
	constructor() {

	}

	/**
	 * Generate all possible unique, unordered pairs of submissions.
	 *
	 * @param submissions Submissions to generate pairs from
	 * @return Set of all unique, unordered pairs of submissions
	 */
	static generatePairs(submissions) {
		checkNotNull(submissions);
		checkArgument(submissions.size >= 2, "Cannot generate pairs with less than 2 submissions!");

		let pairs = new Set();

		let remaining = [];
		remaining.concat(submissions);

		while (remaining.length) {
			// Get the first submission in the list and remove it
			let first = remaining.pop();
			// Form a pair for every remaining submission by pairing with the first, removed submission
			remaining.forEach(function(submission) {
				// Add the newly-generated pair to our return
				pairs.add([first, submission]);
			});
		}

		return pairs;
	}

	/**
	 * Generate all pairs for normal submissions, and pairs for archive submissions to compare to normal submissions.
	 *
	 * @param submissions Normal submissions - compared to each other and archive submissions
	 * @param archiveSubmissions Archive submissions - only compared to normal submissions, not each other
	 * @return Set of all unordered pairs required for comparison with archive directory
	 */
	static generatePairsWithArchive(submissions, archiveSubmissions) {
		checkNotNull(submissions);
		checkNotNull(archiveSubmissions);

		// TODO it may be desirable to allow comparison of a single submission to an archive
		// However, generatePairs fails if only 1 submission is given
		// (This would also require tweaks in the frontend)
		let basePairs = PairGenerator.generatePairs(submissions);

		// Now we need to add pairs for the archive submissions
		archiveSubmissions.forEach(function(first) {
			// For each archive submission, generate pairs for each normal submission
			submissions.forEach(function(s) {
				let pair = [first, s];
				// One pair for each normal submission, consisting of the archive submission and the normal submission
				basePairs.add(pair);
			});
		});

		return basePairs;
	}
}
