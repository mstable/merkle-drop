module.exports = {
    "extends": [
        "plugin:@typescript-eslint/recommended",
        "prettier",
        "prettier/@typescript-eslint",
    ],
    "env": {
        "node": true,
        "browser": true,
        "jest": true,
    },
    "parserOptions": {
        "project": "./tsconfig.json",
    },
    "settings": {
        'import/resolver': {
            "alias": {
                map: [
                    ['@utils', './test-utils'],
                    ['types/generated', './types/generated/index', 'types/contracts']
                ],
                extensions: ['.ts', '.d.ts', '.js', '.json'],
            },
        },
    },
};
