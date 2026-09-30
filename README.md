# Carrinho Universal

Um carrinho universal para reunir produtos de diferentes lojas, organizar por categorias e acompanhar totais em diferentes moedas.

## Site publicado

Acesse: **[Carrinho Universal](https://8080-i0pad4yejxjv8n8zxclpr-f63c1603.us4.manus.computer/)**

## Funcionalidades

- Categorias com capas e arte geométrica generativa.
- Cadastro, edição e exclusão de produtos e categorias.
- Busca rápida por `/` e filtro por texto.
- Carrinho lateral com quantidades, subtotais e conversão para reais.
- Persistência local no navegador via `localStorage`.
- Suporte opcional ao runtime `window.claude` quando disponibilizado.
- Tema claro/escuro seguindo a preferência do sistema, com alternância manual.
- Interface responsiva e acessível para desktop e celular.

## Estrutura

```text
.
├── index.html       # Estrutura da aplicação
├── css/
│   └── styles.css   # Estilos, temas e responsividade
├── js/
│   └── app.js       # Estado, renderização e interações
└── README.md
```

## Como executar localmente

Como os arquivos são estáticos, basta servir a pasta com qualquer servidor HTTP:

```bash
python3 -m http.server 8000
```

Depois, abra <http://localhost:8000>.

## Publicação

O código-fonte está versionado no GitHub e o site está servido publicamente pelo servidor web estático do sandbox.
