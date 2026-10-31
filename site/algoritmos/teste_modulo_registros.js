
'use strict';

const assert = require('node:assert/strict');

const {
    mergeSortRegistros,
    selectionSortRegistros,
    buscaLinearRegistros
} = require('./ordenacao_registros');

const registros = [
    { id: 5, bpm: 80, spo2: 98 },
    { id: 4, bpm: 70, spo2: 97 },
    { id: 3, bpm: 80, spo2: 99 },
    { id: 2, bpm: 65, spo2: 96 },
    { id: 1, bpm: 70, spo2: 98 }
];

const original = structuredClone(registros);

const merge = mergeSortRegistros(registros);
const selection = selectionSortRegistros(registros);

assert.deepEqual(
    merge.registros.map(r => r.bpm),
    [65, 70, 70, 80, 80]
);

assert.deepEqual(
    selection.registros.map(r => r.bpm),
    [65, 70, 70, 80, 80]
);

assert.deepEqual(
    merge.registros.map(r => r.id),
    [2, 4, 1, 5, 3]
);

assert.deepEqual(
    [...merge.registros].sort((a, b) => a.id - b.id),
    [...original].sort((a, b) => a.id - b.id)
);

assert.deepEqual(
    [...selection.registros].sort((a, b) => a.id - b.id),
    [...original].sort((a, b) => a.id - b.id)
);

assert.deepEqual(registros, original);

const busca = buscaLinearRegistros(registros, 70);

assert.equal(busca.encontrados.length, 2);
assert.equal(busca.verificacoes, 5);
assert.deepEqual(busca.encontrados.map(r => r.id), [4, 1]);

assert.equal(merge.comparacoes, 8);
assert.equal(selection.comparacoes, 10);

console.log('OK - Merge Sort e Selection Sort');
console.log('OK - Registros e empates preservados no Merge Sort');
console.log('OK - Busca linear');
console.log('OK - Contagem de comparações');
console.log('OK - Dados originais preservados');
console.log('\nTODOS OS TESTES DO MÓDULO PASSARAM!');
