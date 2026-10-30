
'use strict';

const assert = require('node:assert/strict');

const {
    buscaLinear,
    selectionSort,
    mergeSort
} = require('./ordenacao');

const medicoesBPM = [89, 73, 95, 81, 76, 92, 68];
const resultadoEsperado = [68, 73, 76, 81, 89, 92, 95];

console.log('=== BIOIOT - TESTE DE ALGORITMOS ===');

assert.deepEqual(
    selectionSort(medicoesBPM),
    resultadoEsperado
);
console.log('OK - Selection Sort ordenou corretamente.');

assert.deepEqual(
    mergeSort(medicoesBPM),
    resultadoEsperado
);
console.log('OK - Merge Sort ordenou corretamente.');

assert.equal(buscaLinear(medicoesBPM, 81), 3);
assert.equal(buscaLinear(medicoesBPM, 120), -1);
console.log('OK - Busca linear encontrou e rejeitou valores corretamente.');

// Testes de casos especiais
assert.deepEqual(mergeSort([]), []);
assert.deepEqual(selectionSort([75]), [75]);
assert.deepEqual(mergeSort([80, 80, 75]), [75, 80, 80]);
assert.deepEqual(medicoesBPM, [89, 73, 95, 81, 76, 92, 68]);

console.log('OK - Casos especiais e preservação dos dados.');
console.log('TODOS OS TESTES PASSARAM!');