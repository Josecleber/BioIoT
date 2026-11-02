
let pacienteAtivo = {
    id: null,
    nome: "Nenhum",
    idade: "",
    dispositivo: "ESP32-BANCADA-01"
};

let realtimeChart = null;
let performanceChart = null;
let ultimoIdPlotado = null;
let graficoEmPausa = false;
let memoryChart = null;

const historicoDesempenho = [];

function marcarInterrupcaoGrafico() {
    if (!realtimeChart || graficoEmPausa) return;

    if (realtimeChart.data.labels.length === 0) return;

    realtimeChart.data.labels.push(
        new Date().toLocaleTimeString('pt-BR')
    );

    realtimeChart.data.datasets.forEach(dataset => {
        dataset.data.push(null);
    });

    while (realtimeChart.data.labels.length > 10) {
        realtimeChart.data.labels.shift();
        realtimeChart.data.datasets.forEach(dataset => {
            dataset.data.shift();
        });
    }

    graficoEmPausa = true;
    realtimeChart.update();
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
}

async function verificarStatusConexaoESP() {
    try {
        const resposta = await fetch('/api/status-esp');
        const dados = await resposta.json();

        const elementoCondicao = document.getElementById('condicaoGeralTexto');
        const elementoDispositivo = document.getElementById('activeDevice');

        if (!dados.online) {
            if (elementoCondicao) {
                elementoCondicao.textContent = "SEM SINAL";
                elementoCondicao.style.color = "var(--accent-yellow)";
            }
            if (elementoDispositivo) {
                elementoDispositivo.textContent = `${pacienteAtivo.dispositivo} (Sem Sinal)`;
                elementoDispositivo.style.color = "var(--accent-red)";
            }
        } else {
            if (elementoDispositivo) {
                elementoDispositivo.textContent = pacienteAtivo.dispositivo;
                elementoDispositivo.style.color = "var(--text-main)";
            }
        }
    } catch (erro) {
        console.error("Erro ao verificar status da ESP32:", erro);
    }
}

async function carregarPacientes() {
    try {
        const res = await fetch('/api/pacientes');
        const pacientes = await res.json();

        const tbody = document.getElementById('patientsTableBody');
        tbody.innerHTML = '';

        if (pacientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: var(--text-muted);">Nenhum paciente cadastrado.</td></tr>`;
            return;
        }

        if (!pacienteAtivo.id && pacientes.length > 0) {
            selecionarPacienteParaMonitorar(pacientes[0].id, pacientes[0].nome, pacientes[0].idade, pacientes[0].dispositivo);
        }

        pacientes.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--card-border)';
            tr.innerHTML = `
                <td style="padding: 10px;">${p.nome}</td>
                <td style="padding: 10px;">${p.idade}</td>
                <td style="padding: 10px;">${p.dispositivo}</td>
                <td style="padding: 10px; text-align: right;">
                    <button onclick="selecionarPacienteParaMonitorar(${p.id}, '${p.nome}', ${p.idade}, '${p.dispositivo}')" style="background: var(--accent-blue); color: #fff; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; margin-right: 5px;">Monitorar</button>
                    <button onclick="excluirPaciente(${p.id})" style="background: var(--accent-red); color: #fff; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer;">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro ao carregar pacientes:", err);
    }
}

async function cadastrarPaciente(e) {
    e.preventDefault();
    const nome = document.getElementById('pNome').value;
    const idade = document.getElementById('pIdade').value;
    const dispositivo = document.getElementById('pDispositivo').value;

    try {
        const res = await fetch('/api/pacientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, idade, dispositivo })
        });

        if (res.ok) {
            document.getElementById('patientForm').reset();
            document.getElementById('pDispositivo').value = 'ESP32-BANCADA-01';
            carregarPacientes();
        }
    } catch (err) {
        console.error("Erro ao cadastrar paciente:", err);
    }
}

async function excluirPaciente(id) {
    if (!confirm("Tem certeza que deseja excluir este paciente?")) return;
    try {
        await fetch(`/api/pacientes/${id}`, { method: 'DELETE' });
        carregarPacientes();
    } catch (err) {
        console.error("Erro ao excluir paciente:", err);
    }
}

function selecionarPacienteParaMonitorar(id, nome, idade, dispositivo) {
    pacienteAtivo = { id, nome, idade, dispositivo };

    ultimoIdPlotado = null;
    graficoEmPausa = false;

    if (realtimeChart) {
        realtimeChart.data.labels = [];
        realtimeChart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        realtimeChart.update();
    }

    const elemNome = document.getElementById('activePatientName');
    const elemInfo = document.getElementById('activePatientInfo');
    if (elemNome) elemNome.textContent = nome;
    if (elemInfo) elemInfo.textContent = `(${idade} anos)`;

    const elemDevice = document.getElementById('activeDevice');
    if (elemDevice) elemDevice.textContent = dispositivo;

    atualizarDadosDashboard();
}

async function atualizarDadosDashboard() {
    if (!pacienteAtivo.dispositivo) return;

    try {
        const res = await fetch(`/api/dados/ultimo/${pacienteAtivo.dispositivo}`);
        const dados = await res.json();

        const respostaStatus = await fetch('/api/status-esp');
        const statusESP = await respostaStatus.json();

        if (!statusESP.online) {
            marcarInterrupcaoGrafico();

            document.getElementById('bpmValue').textContent = '--';
            document.getElementById('spo2Value').textContent = '--';

            document.getElementById('bpmStatus').textContent = 'Sem sinal';
            document.getElementById('spo2Status').textContent = 'Sem sinal';

            document.getElementById('bpmStatus').classList.remove('status-normal');
            document.getElementById('spo2Status').classList.remove('status-normal');

            const condicao = document.getElementById('condicaoGeralTexto');

            if (condicao) {
                condicao.textContent = 'SEM SINAL';
                condicao.style.color = 'var(--accent-yellow)';
            }

            return;
        }
        const bpm = dados.bpm || 0;
        const spo2 = dados.spo2 || 0;


        const bpmStatus = document.getElementById('bpmStatus');
        const spo2Status = document.getElementById('spo2Status');

        function atualizarIndicadores(textoBpm, textoSpo2, valido) {
            if (bpmStatus) {
                bpmStatus.textContent = textoBpm;
                bpmStatus.classList.toggle('status-normal', valido);
            }

            if (spo2Status) {
                spo2Status.textContent = textoSpo2;
                spo2Status.classList.toggle('status-normal', valido);
            }
        }

        if (bpm === 0 || spo2 === 0) {
            marcarInterrupcaoGrafico();
            atualizarIndicadores('Sem medição', 'Sem medição', false);
            document.getElementById('bpmValue').textContent = '--';
            document.getElementById('spo2Value').textContent = '--';

            const elementoCondicao = document.getElementById('condicaoGeralTexto');

            if (elementoCondicao) {
                elementoCondicao.textContent = "SEM MEDIÇÃO";
                elementoCondicao.style.color = "var(--accent-yellow)";
            }

            return;
        }

        if (bpm === -1 || spo2 === -1) {
            marcarInterrupcaoGrafico();
            atualizarIndicadores('Calculando...', 'Calculando...', false);
            document.getElementById('bpmValue').innerHTML = '<span style="font-size: 0.5em; color: var(--accent-blue);">Lendo...</span>';
            document.getElementById('spo2Value').innerHTML = '<span style="font-size: 0.5em; color: var(--accent-blue);">Lendo...</span>';

            // Muda o texto do status geral
            const elementoCondicao = document.getElementById('condicaoGeralTexto');
            if (elementoCondicao) {
                elementoCondicao.textContent = "A CALCULAR...";
                elementoCondicao.style.color = "var(--accent-blue)";
            }
            return; // Interrompe aqui para não desenhar o "-1" no gráfico
        }

        document.getElementById('bpmValue').textContent = bpm;
        document.getElementById('spo2Value').textContent = spo2;

        atualizarIndicadores('Leitura disponível', 'Leitura disponível', true);

        const elementoCondicao = document.getElementById('condicaoGeralTexto');

        if (elementoCondicao) {
            elementoCondicao.textContent = "LEITURA DISPONÍVEL";
            elementoCondicao.style.color = "var(--accent-green)";
        }

        if (dados.id == null || dados.id === ultimoIdPlotado) {
            return;
        }

        ultimoIdPlotado = dados.id;
        graficoEmPausa = false;

        const agora = new Date().toLocaleTimeString('pt-BR');

        if (realtimeChart) {
            if (realtimeChart.data.labels.length >= 10) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }

            realtimeChart.data.labels.push(agora);
            realtimeChart.data.datasets[0].data.push(bpm);
            realtimeChart.data.datasets[1].data.push(spo2);
            realtimeChart.update();
        }

    } catch (err) {
        console.error("Erro ao buscar dados do dashboard:", err);
    }
}

function inicializarGraficoSaude() {
    const ctx = document.getElementById('realtimeChart');
    if (!ctx) return;

    realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'BPM (Batimentos)',
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    data: [],
                    tension: 0.3,
                    spanGaps: false,
                    fill: false
                },
                {
                    label: 'SpO₂ (%)',
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    data: [],
                    tension: 0.3,
                    spanGaps: false,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { color: '#334155' } }
            }
        }
    });
}

// Atualiza indicadores usando medições reais do servidor
async function atualizarDesempenho() {
    try {
        const resposta = await fetch('/api/desempenho', {
            cache: 'no-store'
        });

        if (!resposta.ok) {
            throw new Error('Falha ao consultar desempenho');
        }

        const dados = await resposta.json();

        // Registra as amostras reais para análise estatística
        historicoDesempenho.push({
            timestamp: dados.timestamp,
            cpu: dados.cpu.percentual,
            rss: dados.memoria.rssMB,
            heap: dados.memoria.heapUsadoMB
        });

        // Mantém as últimas 600 amostras, aproximadamente 30 minutos
        if (historicoDesempenho.length > 600) {
            historicoDesempenho.shift();
        }

        // Memória real do processo Node.js
        const elementoRSS = document.getElementById('memoryRSS');
        if (elementoRSS) {
            elementoRSS.textContent = dados.memoria.rssMB.toFixed(2);
        }

        const elementoHeap = document.getElementById('memoryHeap');
        if (elementoHeap) {
            elementoHeap.textContent = dados.memoria.heapUsadoMB.toFixed(2);
        }


        // Histórico real da memória do processo Node.js
        if (memoryChart) {
            const horarioMemoria = new Date(dados.timestamp)
                .toLocaleTimeString('pt-BR');

            memoryChart.data.labels.push(horarioMemoria);
            memoryChart.data.datasets[0].data.push(dados.memoria.rssMB);
            memoryChart.data.datasets[1].data.push(dados.memoria.heapUsadoMB);

            // Últimas 60 amostras: aproximadamente 3 minutos
            if (memoryChart.data.labels.length > 60) {
                memoryChart.data.labels.shift();

                memoryChart.data.datasets.forEach(dataset => {
                    dataset.data.shift();
                });
            }

            memoryChart.update('none');
        }

        // Estado real da última comunicação com o ESP32
        const elementoESP = document.getElementById('espStatusPerformance');
        const elementoContato = document.getElementById('espLastContact');

        if (elementoESP) {
            elementoESP.textContent = dados.esp32.online ? 'ONLINE' : 'OFFLINE';
            elementoESP.style.color = dados.esp32.online
                ? 'var(--accent-green)'
                : 'var(--accent-red)';
        }

        if (elementoContato) {
            const segundos = dados.esp32.ultimaComunicacaoSegundos;

            elementoContato.textContent = segundos === null
                ? 'Nenhuma comunicação recebida nesta execução'
                : `Última comunicação há ${segundos} segundo(s)`;
        }

        // CPU real do processo Node.js
        const cpu = dados.cpu.percentual;

        const elementoCPU = document.getElementById('cpuUsage');
        if (elementoCPU) {
            elementoCPU.textContent = cpu.toFixed(2);
        }

        // Tempo real de atividade do servidor
        const segundos = dados.sistema.uptimeSegundos;

        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const segundosRestantes = segundos % 60;

        const formatar = valor => String(valor).padStart(2, '0');

        const uptimeFormatado =
            `${formatar(horas)}:${formatar(minutos)}:${formatar(segundosRestantes)}`;

        const elementoUptime = document.getElementById('uptimeValue');
        if (elementoUptime) {
            elementoUptime.textContent = uptimeFormatado;
        }

        // Histórico gráfico da CPU real
        if (performanceChart) {
            const horario = new Date(dados.timestamp)
                .toLocaleTimeString('pt-BR');

            performanceChart.data.labels.push(horario);
            performanceChart.data.datasets[0].data.push(cpu);

            // Mantém as últimas 30 medições
            if (performanceChart.data.labels.length > 30) {
                performanceChart.data.labels.shift();
                performanceChart.data.datasets[0].data.shift();
            }

            performanceChart.update('none');
        }

    } catch (erro) {
        console.error('Erro ao atualizar desempenho:', erro);

        const elementoCPU = document.getElementById('cpuUsage');
        if (elementoCPU) {
            elementoCPU.textContent = '--';
        }
    }
}


function inicializarGraficoMemoria() {
    const canvas = document.getElementById('memoryChart');
    if (!canvas) return;

    memoryChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Memória RSS (MiB)',
                    data: [],
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2
                },
                {
                    label: 'Heap JavaScript (MiB)',
                    data: [],
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.05)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Memória (MiB)'
                    },
                    grid: { color: '#334155' }
                },
                x: {
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

function inicializarGraficoPerformance() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU (%)',
                    borderColor: '#eab308',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    data: [],
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { color: '#334155' } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarGraficoSaude();
    inicializarGraficoPerformance();
    inicializarGraficoAlgoritmos();
    inicializarGraficoMemoria();

    carregarPacientes();

    setInterval(verificarStatusConexaoESP, 3000);
    setInterval(atualizarDadosDashboard, 2000);

    atualizarDesempenho();
    setInterval(atualizarDesempenho, 3000);
});

async function exportarRelatorioCSV() {
    try {
        const tipo = document.getElementById('tipoRelatorio').value;
        let url = '/api/relatorios/geral';

        if (tipo === 'individual' && pacienteAtivo.dispositivo) {
            url = `/api/relatorios/individual/${pacienteAtivo.dispositivo}`;
        }

        const res = await fetch(url);
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            alert("Não existem dados disponíveis para exportar neste relatório.");
            return;
        }


        let csvContent = "data:text/csv;charset=utf-8,ID,Dispositivo,BPM,SpO2,DataHora\n";

        dados.forEach(row => {
            csvContent += `${row.id},${row.dispositivo},${row.bpm},${row.spo2},${row.timestamp}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `relatorio_bioiot_${tipo}.csv`);
        document.body.appendChild(link);

        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Erro ao exportar CSV:", err);
        alert("Erro ao gerar o relatório CSV.");
    }
}


function calcularConsumoEnergetico() {
    const tensao = Number(document.getElementById('energiaTensao').value);
    const corrente = Number(document.getElementById('energiaCorrente').value);
    const horas = Number(document.getElementById('energiaHoras').value);
    const campoTarifa = document.getElementById('energiaTarifa');
    const resultado = document.getElementById('resultadoConsumoEnergetico');

    const tarifa = Number(campoTarifa.value);

    if (
        !campoTarifa.value.trim() ||
        !Number.isFinite(tensao) || tensao <= 0 ||
        !Number.isFinite(corrente) || corrente <= 0 ||
        !Number.isFinite(horas) || horas <= 0 ||
        !Number.isFinite(tarifa) || tarifa < 0
    ) {
        resultado.textContent =
            'Informe valores válidos para tensão, corrente, horas e tarifa.';
        return;
    }

    const potenciaW = tensao * (corrente / 1000);
    const consumoKWh = (potenciaW * horas) / 1000;
    const custo = consumoKWh * tarifa;

    const custoHora = (potenciaW / 1000) * tarifa;
    const custoDia = custoHora * 24;
    const custoMes = custoDia * 30;

    const numero = valor => valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
    });

    const moeda = valor => valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
    });

    resultado.innerHTML = `
        <h3 style="color:var(--accent-blue); margin-bottom:1rem;">
            Resultado da estimativa energética
        </h3>

        <div class="grid-cards">
            <div class="card">
                <div class="card-header">POTÊNCIA ESTIMADA</div>
                <h2>${numero(potenciaW)} W</h2>
            </div>

            <div class="card">
                <div class="card-header">CONSUMO NO PERÍODO</div>
                <h2>${numero(consumoKWh)} kWh</h2>
            </div>

            <div class="card">
                <div class="card-header">CUSTO NO PERÍODO</div>
                <h2>${moeda(custo)}</h2>
            </div>
        </div>

        <p style="margin-top:1rem;">
            <strong>Custo por hora:</strong> ${moeda(custoHora)}
        </p>
        <p>
            <strong>Custo por dia (24 h):</strong> ${moeda(custoDia)}
        </p>
        <p>
            <strong>Custo por mês (30 dias):</strong> ${moeda(custoMes)}
        </p>

        <p style="margin-top:1rem; font-size:0.85rem;">
            Cálculo: potência = tensão × corrente.
            Consumo = potência × tempo ÷ 1000.
            Custo = consumo × tarifa.
            Os resultados consideram potência constante e não representam
            uma medição elétrica do dispositivo.
        </p>
    `;

    const cardCusto = document.getElementById('energyCost');

    if (cardCusto) {
        cardCusto.textContent = moeda(custo);
    }
}


function analisarEstatisticasDesempenho() {
    const resultado = document.getElementById('resultadoEstatisticasDesempenho');

    if (!resultado) return;

    if (historicoDesempenho.length === 0) {
        resultado.textContent =
            'Ainda não existem amostras. Aguarde a coleta de dados.';
        return;
    }

    const quantidade = historicoDesempenho.length;

    const estatisticas = (campo) => {
        const valores = historicoDesempenho
            .map(amostra => amostra[campo])
            .filter(Number.isFinite);

        if (valores.length === 0) return null;

        const soma = valores.reduce((total, valor) => total + valor, 0);

        return {
            media: soma / valores.length,
            minimo: Math.min(...valores),
            maximo: Math.max(...valores)
        };
    };

    const cpu = estatisticas('cpu');
    const rss = estatisticas('rss');
    const heap = estatisticas('heap');

    if (!cpu || !rss || !heap) {
        resultado.textContent = 'Não foi possível analisar as amostras.';
        return;
    }

    const inicio = new Date(historicoDesempenho[0].timestamp);
    const fim = new Date(historicoDesempenho[quantidade - 1].timestamp);

    const formatar = valor => valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    resultado.innerHTML = `
        <h3 style="color:var(--accent-blue); margin-bottom:1rem;">
            Resultados da análise estatística
        </h3>

        <div class="grid-cards">
            <div class="card">
                <div class="card-header">CPU MÉDIA</div>
                <h2>${formatar(cpu.media)}%</h2>
                <p>Percentual de um núcleo de CPU.</p>
            </div>

            <div class="card">
                <div class="card-header">CPU MÁXIMA</div>
                <h2>${formatar(cpu.maximo)}%</h2>
                <p>Maior valor observado na sessão.</p>
            </div>

            <div class="card">
                <div class="card-header">MEMÓRIA RSS MÉDIA</div>
                <h2>${formatar(rss.media)} MiB</h2>
                <p>Média da memória residente.</p>
            </div>

            <div class="card">
                <div class="card-header">PICO DE MEMÓRIA RSS</div>
                <h2>${formatar(rss.maximo)} MiB</h2>
                <p>Maior consumo observado.</p>
            </div>

            <div class="card">
                <div class="card-header">PICO DO HEAP JAVASCRIPT</div>
                <h2>${formatar(heap.maximo)} MiB</h2>
                <p>Maior utilização observada do heap.</p>
            </div>

            <div class="card">
                <div class="card-header">AMOSTRAS ANALISADAS</div>
                <h2>${quantidade}</h2>
                <p>Amostras reais coletadas da API.</p>
            </div>
        </div>

        <p style="margin-top:1.5rem; color:var(--text-muted);">
            <strong>Início:</strong> ${inicio.toLocaleString('pt-BR')}
            <br>
            <strong>Fim:</strong> ${fim.toLocaleString('pt-BR')}
            <br>
            <strong>Período observado:</strong>
            ${Math.max(0, Math.round((fim - inicio) / 1000))} segundos.
        </p>

        <p style="margin-top:1rem; color:var(--text-muted); font-size:0.85rem;">
            Estatísticas calculadas com amostras reais do processo Node.js,
            executado no Docker. Não representam o consumo total do
            computador ou do ESP32.
            A análise utiliza até as últimas 600 amostras disponíveis
            nesta página.
        </p>
    `;
}
