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

//import net.lldp.checksims.algorithm.similaritymatrix.SimilarityMatrix;
//import net.lldp.checksims.util.reflection.NamedInstantiable;
import { NamedInstantiable } from '/scripts/util/reflection.NamedInstantiable/js';


/**
 * Output a Similarity Matrix in human-readable or machine-readable format.
 */
export class MatrixPrinter extends NamedInstantiable {
    /**
     * Print a Similarity Matrix to string.
     *
     * @param matrix Matrix to print
     * @return String representation of matrix
     * @throws InternalAlgorithmError Thrown on internal error processing matrix
     */
    printMatrix(matrix){
        throw new Error("Not Implemented");
    }
}
