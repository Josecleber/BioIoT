
'use strict';

// Busca linear: O(n) no pior caso.
function buscaLinear(valores, procurado) {
    for (let i = 0; i < valores.length; i++) {
        if (valores[i] === procurado) {
            return i;
        }
    }
    return -1;
}

// Selection Sort: Θ(n²) em comparações.
function selectionSort(valores) {
    const resultado = [...valores];

    for (let i = 0; i < resultado.length - 1; i++) {
        let menor = i;

        for (let j = i + 1; j < resultado.length; j++) {
            if (resultado[j] < resultado[menor]) {
                menor = j;
            }
        }

        if (menor !== i) {
            [resultado[i], resultado[menor]] =
                [resultado[menor], resultado[i]];
        }
    }

    return resultado;
}

// Merge Sort: Θ(n log n) em tempo.
// Relação de recorrência:
// T(n) = 2T(n/2) + Θ(n)
function mergeSort(valores) {
    if (valores.length <= 1) {
        return [...valores];
    }

    const meio = Math.floor(valores.length / 2);

    const esquerda = mergeSort(valores.slice(0, meio));
    const direita = mergeSort(valores.slice(meio));

    return intercalar(esquerda, direita);
}

function intercalar(esquerda, direita) {
    const resultado = [];
    let i = 0;
    let j = 0;

    while (i < esquerda.length && j < direita.length) {
        if (esquerda[i] <= direita[j]) {
            resultado.push(esquerda[i++]);
        } else {
            resultado.push(direita[j++]);
        }
    }

    while (i < esquerda.length) {
        resultado.push(esquerda[i++]);
    }

    while (j < direita.length) {
        resultado.push(direita[j++]);
    }

    return resultado;
}

module.exports = {
    buscaLinear,
    selectionSort,
    mergeSort
};