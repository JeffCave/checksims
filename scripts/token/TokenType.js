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

import { ChecksimsException } from '/scripts/ChecksimsException.js';
import { checkNotNull, checkArgument, assert } from '/scripts/util/misc.js';

/**
 * Supported token types.
 *
 * Each token has a Type, representing how it was generated. Line tokens, for example, are generated by splitting an
 * input string at every newline. Tokens are only considered equal if their contents and type match.
 */
export const TokenType = {
	CHARACTER:("character"),
	WHITESPACE:("whitespace"),
	LINE:("line")
};

Object.seal(TokenType);
