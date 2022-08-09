# Agena AI Cloud JavaScript API
The `api-js` package is an optional helper library, which provides functions to authenticate with Agena AI Cloud and execute individual or batch calculation requests.

It is designed to work in [Node.js](https://nodejs.org/) and browser environments.

Published on [npmjs.com](https://www.npmjs.com) as [agena-api-js](https://www.npmjs.com/package/agena-api-js).

# Usage

## Import from npm
```
npm i agena-api-js
```
or
```
yarn add agena-api-js
```

## Import with [unpkg.com](https://unpkg.com)
With `await import`:
```
await import('https://unpkg.com/agena-api-js/dist/agena-api.js').then((m) => agena = m.default);
```

As script module:
```
<script type="module">
    import agena from 'https://unpkg.com/agena-api-js/dist/agena-api.js';
</script>
```

As global module variable:
```
<script src="https://unpkg.com/agena-api-js/dist/agena-api-winvar.js"></script>
<script>
    const agena = AgenaApi.default;
</script>
```

## API Server
You can specify the API Server to use with:
```
agena.init({
    api: {
        server: 'https://api.staging.agenarisk.com',
    },
});
```

## Authentication
```
await agena.logIn({username: 'test@example.com', password: '12344567890'});
```
Once authenticated, subsequent calls to `agena.calculate()` or `agena.calculateBatch()` will automatically use the correct token when making requests to the API server.

In case you implement calculation requests yourself, you can use this library to authenticate your custom requests, e.g.
```
fetch(url, {
    method: 'POST',
    body,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'text/plain; charset=utf-8',
        Authorization: `Bearer ${agena.getAccessToken().accessToken}`
    }
})...
```

## Examples
This simple example authenticates and calculates a very basic model with a single observation.
```
await agena.logIn({username: 'test@example.com', password: '12344567890'});
const model = {networks:[{id:'net', nodes:[{id:'node1'}, {id:'node2'}]}]}; // extremely basic example for the sake of the example
const response = await agena.calculate({
    model,
    observations: [{network: 'net', node: 'node1', entry: 'True'}]
});
console.log(response.results);

```
Prints:
```
[
    {
        "node": "node1",
        "resultValues": [
            {
                "label": "False",
                "value": 0
            },
            {
                "label": "True",
                "value": 1
            }
        ],
        "network": "net"
    },
    {
        "node": "node2",
        "resultValues": [
            {
                "label": "False",
                "value": 0.5
            },
            {
                "label": "True",
                "value": 0.5
            }
        ],
        "network": "net"
    }
]
```
More examples usage can be found in the examples directory.

See documentation for exact format for the model, observations and results.

# Documentation
Relevant documentation includes details on the JSON format of Agena AI models and can be found [here](https://agenarisk.atlassian.net/l/cp/hvpeVvJH).