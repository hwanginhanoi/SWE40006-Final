// tests/simple.test.js
describe('Simple String Test', () => {
    test('two identical strings should be equal', () => {
        // Arrange
        const string1 = 'hello world';
        const string2 = 'hello world';

        // Act & Assert
        expect(string1).toEqual(string2);
    });

    test('two different strings should not be equal', () => {
        // Arrange
        const string1 = 'hello';
        const string2 = 'world';

        // Act & Assert
        expect(string1).not.toEqual(string2);
    });
});