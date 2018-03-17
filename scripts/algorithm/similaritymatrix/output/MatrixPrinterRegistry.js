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

import {RegistryWithDefault} from '/scripts/util/reflection/RegistryWithDefault.js';
import {MatrixToHTMLPrinter} from '/scripts/similaritymatrix/output/MatrixToHTMLPrinter.js';


/**
 * Registry for Matrix Printers.
 */
export class MatrixPrinterRegistry extends RegistryWithDefault {
	constructor() {
		let printers = [
				'MatrixToCSVPrinter',
				'MatrixToHTMLPrinter',
			];
		let def = MatrixToHTMLPrinter.getInstance().getName();
		super( printers, "MatrixPrinter", [], def);
	}

	/**
	 * @return Singleton instance of MatrixPrinterRegistry
	 */
	static getInstance() {
		if('instance' in MatrixPrinterRegistry) {
			return MatrixPrinterRegistry.instance;
		}
		MatrixPrinterRegistry.instance = new MatrixPrinterRegistry();
		return MatrixPrinterRegistry.instance;
	}

	toString() {
		return "Singleton instance of MatrixPrinterRegistry";
	}
}
