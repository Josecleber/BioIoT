
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


async function carregarTabelaRelatorios() {
    const tipo = document.getElementById('tipoRelatorio').value;
    const tabela = document.getElementById('relatoriosTableBody');
    const titulo = document.getElementById('tituloTabelaRelatorio');

    tabela.replaceChildren();

    const mostrarMensagem = (mensagem) => {
        tabela.replaceChildren();
        const linha = tabela.insertRow();
        const celula = linha.insertCell();

        celula.colSpan = 5;
        celula.textContent = mensagem;
        celula.style.cssText =
            'padding: 15px; text-align: center; color: var(--text-muted);';
    };

    mostrarMensagem('Carregando medições...');

    try {
        let leituras = [];

        if (tipo === 'individual') {
            const seletor = document.getElementById('pacienteRelatorio');
            const pacienteId = Number(seletor?.value);

            if (!Number.isSafeInteger(pacienteId) || pacienteId <= 0) {
                titulo.textContent = 'Histórico Individual';
                mostrarMensagem('Selecione um paciente para consultar o histórico.');
                return;
            }

            const resposta = await fetch(
                `/api/pacientes/${pacienteId}/historico`
            );

            if (!resposta.ok) {
                throw new Error('Não foi possível consultar o paciente.');
            }

            const resultado = await resposta.json();
            leituras = resultado.leituras;

            titulo.textContent =
                `Histórico Individual — ${resultado.paciente.nome}`;

        } else {
            titulo.textContent = 'Histórico Geral — Últimas 100 medições';

            const resposta = await fetch('/api/relatorios/geral');

            if (!resposta.ok) {
                throw new Error('Não foi possível consultar o histórico geral.');
            }

            leituras = await resposta.json();
        }

        tabela.replaceChildren();

        if (!Array.isArray(leituras) || leituras.length === 0) {
            mostrarMensagem('Nenhuma medição encontrada.');
            return;
        }

        leituras.forEach(leitura => {
            const linha = tabela.insertRow();

            const data = new Date(
                leitura.timestamp.replace(' ', 'T') + 'Z'
            );

            const valores = [
                leitura.id,
                leitura.dispositivo,
                leitura.bpm,
                leitura.spo2,
                data.toLocaleString('pt-BR')
            ];

            valores.forEach(valor => {
                const celula = linha.insertCell();
                celula.textContent = valor;
                celula.style.cssText =
                    'padding: 10px; border-bottom: 1px solid var(--card-border);';
            });
        });

    } catch (erro) {
        console.error('Erro ao carregar relatórios:', erro);
        mostrarMensagem('Erro ao consultar as medições.');
    }
}

function mudarTipoRelatorio() {
    const tipo = document.getElementById('tipoRelatorio').value;
    const campoPaciente = document.getElementById('campoPacienteRelatorio');

    if (campoPaciente) {
        campoPaciente.style.display =
            tipo === 'individual' ? 'block' : 'none';
    }

    carregarTabelaRelatorios();
}

async function carregarPacientesRelatorio() {
    try {
        const resposta = await fetch('/api/pacientes');

        if (!resposta.ok) {
            throw new Error('Falha ao carregar pacientes.');
        }

        const pacientes = await resposta.json();
        const seletor = document.getElementById('pacienteRelatorio');

        seletor.replaceChildren();

        const opcaoInicial = document.createElement('option');
        opcaoInicial.value = '';
        opcaoInicial.textContent = 'Selecione um paciente';
        seletor.appendChild(opcaoInicial);

        pacientes.forEach(paciente => {
            const opcao = document.createElement('option');
            opcao.value = paciente.id;
            opcao.textContent = `${paciente.nome} — ${paciente.idade} anos`;
            seletor.appendChild(opcao);
        });

    } catch (erro) {
        console.error('Erro ao carregar pacientes do relatório:', erro);
    }
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
    if (tabId === 'relatorios') {
        carregarPacientesRelatorio().then(() => {
            mudarTipoRelatorio();
        });
    }
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


        pacientes.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--card-border)';

            const criarCelula = (valor) => {
                const td = document.createElement('td');
                td.style.padding = '10px';
                td.textContent = valor;
                return td;
            };

            tr.appendChild(criarCelula(p.nome));
            tr.appendChild(criarCelula(p.idade));
            tr.appendChild(criarCelula(p.dispositivo));

            const acoes = document.createElement('td');
            acoes.style.padding = '10px';
            acoes.style.textAlign = 'right';

            const criarBotao = (texto, cor, acao) => {
                const botao = document.createElement('button');
                botao.type = 'button';
                botao.textContent = texto;
                botao.style.cssText = `
            background: ${cor};
            color: #fff;
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 4px;
            cursor: pointer;
            margin: 3px;
        `;
                botao.addEventListener('click', acao);
                return botao;
            };

            acoes.appendChild(
                criarBotao('Monitorar', 'var(--accent-blue)', () => {
                    selecionarPacienteParaMonitorar(
                        p.id, p.nome, p.idade, p.dispositivo
                    );
                })
            );

            acoes.appendChild(
                criarBotao('Ver histórico', 'var(--accent-green)', () => {
                    visualizarHistoricoPaciente(p.id);
                })
            );

            acoes.appendChild(
                criarBotao('Excluir', 'var(--accent-red)', () => {
                    excluirPaciente(p.id);
                })
            );

            tr.appendChild(acoes);
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
    const confirmar = confirm(
        'Tem certeza que deseja excluir este paciente?'
    );

    if (!confirmar) return;

    try {
        const resposta = await fetch(`/api/pacientes/${id}`, {
            method: 'DELETE'
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            alert(resultado.erro || 'Não foi possível excluir o paciente.');
            return;
        }

        alert(resultado.mensagem || 'Paciente excluído com sucesso.');

        // Atualiza a lista somente após exclusão confirmada.
        await carregarPacientes();

        // Atualiza também o seletor da aba Relatórios.
        if (typeof carregarPacientesRelatorio === 'function') {
            await carregarPacientesRelatorio();
        }

    } catch (erro) {
        console.error('Erro ao excluir paciente:', erro);
        alert('Falha de comunicação ao tentar excluir o paciente.');
    }
}

async function visualizarHistoricoPaciente(pacienteId) {
    try {
        const resposta = await fetch(
            `/api/pacientes/${encodeURIComponent(pacienteId)}/historico`
        );

        if (!resposta.ok) {
            throw new Error('Não foi possível consultar o histórico.');
        }

        const dados = await resposta.json();

        const { paciente, resumo, leituras } = dados;

        document.getElementById('historicoPacienteNome').textContent =
            `${paciente.nome} — ${paciente.idade} anos`;

        document.getElementById('historicoTotal').textContent =
            resumo.total;

        document.getElementById('historicoMediaBpm').textContent =
            resumo.mediaBpm == null
                ? '--'
                : Number(resumo.mediaBpm).toFixed(2).replace('.', ',');

        document.getElementById('historicoMediaSpo2').textContent =
            resumo.mediaSpo2 == null
                ? '--'
                : Number(resumo.mediaSpo2).toFixed(2).replace('.', ',') + '%';

        const tabela = document.getElementById('historicoPacienteTabela');
        tabela.replaceChildren();

        if (leituras.length === 0) {
            const linha = tabela.insertRow();
            const celula = linha.insertCell();
            celula.colSpan = 4;
            celula.textContent = 'Nenhuma medição registrada para este paciente.';
            celula.style.padding = '16px';
        } else {
            leituras.forEach(leitura => {
                const linha = tabela.insertRow();

                // Timestamp do SQLite está em UTC.
                const data = new Date(leitura.timestamp.replace(' ', 'T') + 'Z');

                const valores = [
                    data.toLocaleString('pt-BR'),
                    leitura.bpm,
                    leitura.spo2 + '%',
                    leitura.dispositivo
                ];

                valores.forEach(valor => {
                    const celula = linha.insertCell();
                    celula.textContent = valor;
                    celula.style.padding = '10px';
                    celula.style.borderBottom =
                        '1px solid var(--card-border)';
                });
            });
        }

        document.getElementById('historicoPacienteCard').style.display =
            'block';

    } catch (erro) {
        console.error('Erro ao carregar histórico:', erro);
        alert(erro.message);
    }
}

async function selecionarPacienteParaMonitorar(id, nome, idade, dispositivo) {
    try {
        const resposta = await fetch('/api/monitoramento/iniciar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pacienteId: id })
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(resultado.erro || 'Erro ao iniciar monitoramento');
        }

        const paciente = resultado.paciente;

        pacienteAtivo = {
            id: paciente.id,
            nome: paciente.nome,
            idade: paciente.idade,
            dispositivo: paciente.dispositivo
        };

        // Reinicia o histórico visual para não misturar pacientes.
        ultimoIdPlotado = null;
        graficoEmPausa = false;

        if (realtimeChart) {
            realtimeChart.data.labels = [];

            realtimeChart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });

            realtimeChart.update();
        }

        document.getElementById('bpmValue').textContent = '--';
        document.getElementById('spo2Value').textContent = '--';

        const nomeElemento = document.getElementById('activePatientName');
        const infoElemento = document.getElementById('activePatientInfo');
        const dispositivoElemento = document.getElementById('activeDevice');

        if (nomeElemento) nomeElemento.textContent = paciente.nome;
        if (infoElemento) infoElemento.textContent = `(${paciente.idade} anos)`;
        if (dispositivoElemento) dispositivoElemento.textContent = paciente.dispositivo;

        atualizarDadosDashboard();

        console.log('Monitoramento iniciado:', paciente);

    } catch (erro) {
        console.error('Erro ao iniciar monitoramento:', erro);
        alert(erro.message);
    }
}


async function encerrarMonitoramento() {
    if (!pacienteAtivo.id) {
        alert('Nenhum paciente está selecionado nesta página.');
        return;
    }

    const dispositivo = pacienteAtivo.dispositivo;

    try {
        const resposta = await fetch('/api/monitoramento/encerrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dispositivo })
        });

        if (!resposta.ok) {
            throw new Error('Não foi possível encerrar o monitoramento.');
        }

        pacienteAtivo = {
            id: null,
            nome: 'Nenhum',
            idade: '',
            dispositivo: 'ESP32-BANCADA-01'
        };

        ultimoIdPlotado = null;
        graficoEmPausa = false;

        if (realtimeChart) {
            realtimeChart.data.labels = [];
            realtimeChart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            realtimeChart.update();
        }

        document.getElementById('activePatientName').textContent = 'Nenhum';
        document.getElementById('activePatientInfo').textContent = '( - )';
        document.getElementById('bpmValue').textContent = '--';
        document.getElementById('spo2Value').textContent = '--';

        const condicao = document.getElementById('condicaoGeralTexto');
        if (condicao) {
            condicao.textContent = 'SEM MONITORAMENTO';
            condicao.style.color = 'var(--accent-yellow)';
        }

        alert('Monitoramento encerrado com sucesso.');

    } catch (erro) {
        console.error('Erro ao encerrar monitoramento:', erro);
        alert(erro.message);
    }
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


async function sincronizarPacienteAtivo() {
    try {
        const dispositivo = 'ESP32-BANCADA-01';

        const resposta = await fetch(
            `/api/monitoramento/${encodeURIComponent(dispositivo)}`
        );

        if (!resposta.ok) {
            throw new Error('Falha ao consultar monitoramento.');
        }

        const monitoramento = await resposta.json();

        let paciente = null;

        if (monitoramento.ativo && monitoramento.pacienteId != null) {
            const respostaPacientes = await fetch('/api/pacientes');

            if (!respostaPacientes.ok) {
                throw new Error('Falha ao consultar pacientes.');
            }

            const pacientes = await respostaPacientes.json();

            paciente = pacientes.find(
                p => Number(p.id) === Number(monitoramento.pacienteId)
            );

            if (!paciente) {
                throw new Error('Paciente ativo não encontrado no cadastro.');
            }
        }

        pacienteAtivo = paciente
            ? {
                id: paciente.id,
                nome: paciente.nome,
                idade: paciente.idade,
                dispositivo: paciente.dispositivo
            }
            : {
                id: null,
                nome: 'Nenhum',
                idade: '',
                dispositivo
            };

        ultimoIdPlotado = null;
        graficoEmPausa = false;

        if (realtimeChart) {
            realtimeChart.data.labels = [];
            realtimeChart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            realtimeChart.update();
        }

        const nomeElemento = document.getElementById('activePatientName');
        const infoElemento = document.getElementById('activePatientInfo');
        const dispositivoElemento = document.getElementById('activeDevice');

        if (nomeElemento) {
            nomeElemento.textContent = pacienteAtivo.nome;
        }

        if (infoElemento) {
            infoElemento.textContent = paciente
                ? `(${paciente.idade} anos)`
                : '( - )';
        }

        if (dispositivoElemento) {
            dispositivoElemento.textContent = pacienteAtivo.dispositivo;
        }

        const bpmElemento = document.getElementById('bpmValue');
        const spo2Elemento = document.getElementById('spo2Value');

        if (bpmElemento) bpmElemento.textContent = '--';
        if (spo2Elemento) spo2Elemento.textContent = '--';

        console.log('Monitoramento sincronizado:', monitoramento);

    } catch (erro) {
        console.error('Erro ao sincronizar paciente:', erro);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarGraficoSaude();
    inicializarGraficoPerformance();
    inicializarGraficoAlgoritmos();
    inicializarGraficoMemoria();

    carregarPacientes();

    sincronizarPacienteAtivo();

    setInterval(verificarStatusConexaoESP, 3000);
    setInterval(atualizarDadosDashboard, 2000);

    atualizarDesempenho();
    setInterval(atualizarDesempenho, 3000);
});


async function exportarRelatorioCSV() {
    try {
        const tipo = document.getElementById('tipoRelatorio').value;
        let dados = [];
        let nomeArquivo = 'relatorio_bioiot_geral.csv';


        if (tipo === 'individual') {
            const seletor = document.getElementById('pacienteRelatorio');
            const pacienteId = Number(seletor?.value);

            if (!Number.isSafeInteger(pacienteId) || pacienteId <= 0) {
                alert('Selecione um paciente para exportar o relatório individual.');
                return;
            }

            const resposta = await fetch(
                `/api/pacientes/${encodeURIComponent(pacienteId)}/historico`
            );

            if (!resposta.ok) {
                throw new Error('Falha ao consultar histórico do paciente.');
            }

            const resultado = await resposta.json();
            dados = resultado.leituras;
            nomeArquivo = `relatorio_bioiot_paciente_${pacienteId}.csv`;

        } else {
            const resposta = await fetch('/api/relatorios/geral');

            if (!resposta.ok) {
                throw new Error('Falha ao consultar relatório geral.');
            }

            dados = await resposta.json();
        }

        if (!Array.isArray(dados) || dados.length === 0) {
            alert('Não existem medições disponíveis para este relatório.');
            return;
        }

        // Gera CSV com os registros consultados.
        const linhas = [
            ['ID', 'Dispositivo', 'BPM', 'SpO2', 'DataHora']
        ];

        dados.forEach(leitura => {
            linhas.push([
                leitura.id,
                leitura.dispositivo,
                leitura.bpm,
                leitura.spo2,
                leitura.timestamp
            ]);
        });

        // Protege os campos contra separadores, aspas e fórmulas em CSV.
        const escaparCSV = valor => {
            let texto = String(valor ?? '');

            if (/^[\s]*[=+\-@\t\r]/.test(texto)) {
                texto = "'" + texto;
            }

            return '"' + texto.replace(/"/g, '""') + '"';
        };

        const conteudo = '\uFEFF' +
            linhas.map(linha => linha.map(escaparCSV).join(';')).join('\r\n');

        const arquivo = new Blob([conteudo], {
            type: 'text/csv;charset=utf-8;'
        });

        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');

        link.href = url;
        link.download = nomeArquivo;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (erro) {
        console.error('Erro ao exportar CSV:', erro);
        alert('Não foi possível gerar o relatório CSV.');
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


async function analisarComunicacaoESP32() {
    const resultado = document.getElementById('resultadoComunicacaoESP32');
    if (!resultado) return;

    resultado.textContent = 'Consultando dados reais de comunicação...';

    try {
        const resposta = await fetch('/api/estatisticas-comunicacao', {
            cache: 'no-store'
        });

        if (!resposta.ok) {
            throw new Error('Erro ao consultar comunicação');
        }

        const dados = await resposta.json();

        const heartbeats = dados.heartbeats;
        const medicoes = dados.medicoes;

        const formatarIntervalo = valor =>
            valor === null
                ? 'Sem dados'
                : `${(valor / 1000).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })} s`;


        const indicadores = [
            ['HEARTBEATS RECEBIDOS', heartbeats.recebidos],
            ['INTERVALO MÉDIO', formatarIntervalo(heartbeats.intervaloMedioMs)],
            ['MAIOR INTERVALO', formatarIntervalo(heartbeats.intervaloMaximoMs)],
            ['REQUISIÇÕES RECEBIDAS', medicoes.recebidas],
            ['REQUISIÇÕES ACEITAS', medicoes.aceitas],
            ['ESTADOS DA INTERFACE', medicoes.estadosInterface],
            ['LEITURAS GRAVADAS NO SQLITE', medicoes.leiturasGravadas],
            ['REQUISIÇÕES REJEITADAS', medicoes.rejeitadas],
            ['FALHAS NO BANCO SQLITE', medicoes.falhasBanco],
            ['CONEXÃO ESP32', dados.esp32.online ? 'ONLINE' : 'OFFLINE']
        ];


        const cards = indicadores.map(([titulo, valor]) => `
            <div class="card">
                <div class="card-header">${titulo}</div>
                <h2 style="color:var(--accent-blue); margin-top:0.8rem;">
                    ${valor}
                </h2>
            </div>
        `).join('');

        const inicio = new Date(dados.inicioSessao)
            .toLocaleString('pt-BR');

        resultado.innerHTML = `
            <h3 style="color:var(--accent-blue); margin-bottom:1rem;">
                Resultados da comunicação real
            </h3>

            <div class="grid-cards">
                ${cards}
            </div>

            <p style="margin-top:1.5rem; color:var(--text-muted);">
                <strong>Início da sessão do servidor:</strong> ${inicio}
                <br>
                <strong>Intervalos analisados:</strong>
                ${heartbeats.intervalosAnalisados}
            </p>

            <p style="margin-top:1rem; color:var(--text-muted);
                      font-size:0.85rem;">
                As estatísticas representam requisições que chegaram ao
                servidor. Não contabilizam tentativas que falharam antes
                de chegar ao BioIoT. Os contadores reiniciam quando
                o processo Node.js é reiniciado.
            </p>
        `;

    } catch (erro) {
        console.error('Erro ao analisar comunicação:', erro);
        resultado.textContent =
            'Não foi possível consultar as estatísticas de comunicação.';
    }
}
