
'use strict';

const assert = require('node:assert/strict');

// Verifica uma solução candidata em O(n).
function verificarSolucao(valores, indices, alvo) {
    const escolhidos = new Set(indices);

    if (escolhidos.size !== indices.length) return false;

    let soma = 0;

    for (const indice of escolhidos) {
        if (!Number.isInteger(indice) ||
            indice < 0 || indice >= valores.length) {
            return false;
        }
        soma += valores[indice];
    }

    return soma === alvo;
}

// Busca exaustiva: examina todos os subconjuntos.
// Tempo O(2^n) no pior caso, com trabalho por folha
// constante para atualizar a soma.
function buscaExaustiva(valores, alvo) {
    let candidatos = 0;
    let encontrou = false;

    function explorar(posicao, soma) {
        if (posicao === valores.length) {
            candidatos++;
            if (soma === alvo) encontrou = true;
            return;
        }

        explorar(posicao + 1, soma);
        explorar(posicao + 1, soma + valores[posicao]);
    }

    explorar(0, 0);
    return { encontrou, candidatos };
}

// Programação dinâmica para inteiros não negativos.
// Tempo O(n * alvo) e espaço O(alvo).
// É pseudopolinomial, não polinomial no tamanho
// binário da entrada em geral.
function programacaoDinamica(valores, alvo) {
    const possivel = new Uint8Array(alvo + 1);
    possivel[0] = 1;

    for (const valor of valores) {
        for (let soma = alvo; soma >= valor; soma--) {
            if (possivel[soma - valor]) {
                possivel[soma] = 1;
            }
        }
    }

    return Boolean(possivel[alvo]);
}

console.log('=== BIOIOT - CLASSES E INTRATABILIDADE ===');

// Exemplo com solução verificável.
const exemplo = [4, 7, 10, 13];
const alvoExemplo = 17;

assert.equal(verificarSolucao(exemplo, [0, 3], alvoExemplo), true);
assert.equal(verificarSolucao(exemplo, [0, 0], alvoExemplo), false);

assert.equal(buscaExaustiva(exemplo, alvoExemplo).encontrou, true);
assert.equal(programacaoDinamica(exemplo, alvoExemplo), true);

console.log('OK - Verificação de solução candidata.');
console.log('OK - Busca exaustiva e programação dinâmica.');
console.log('\n n | Subconjuntos examinados | Resultado');

for (const n of [8, 12, 16, 18]) {
    // Todos os custos são pares.
    const valores = Array.from({ length: n }, (_, i) => 2 * (i + 1));

    // Alvo ímpar, portanto não existe solução.
    // Foi escolhido para demonstrar o pior caso da busca.
    const alvo = 2 * n + 1;

    const exaustiva = buscaExaustiva(valores, alvo);
    const dinamica = programacaoDinamica(valores, alvo);

    assert.equal(exaustiva.encontrou, false);
    assert.equal(dinamica, false);
    assert.equal(exaustiva.candidatos, 2 ** n);

    console.log(
        `${String(n).padStart(2)} | ` +
        `${String(exaustiva.candidatos).padStart(23)} | ` +
        'Sem solução'
    );
}

console.log('\nExperimento concluído com sucesso!');