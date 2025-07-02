---
description: Comprehensive guidelines for TypeScript development, covering code organization, common patterns, performance, security, testing, tooling, and more. Ensures high-quality, maintainable, and scalable TypeScript code.
applyTo: '**/*.ts,**/*.tsx'
---

- **Core TypeScript Best Practices**
  - Focuses on fundamental practices to improve code quality, maintainability, and scalability.

  - **Start with Strict Type-Checking**
    - Enable the `strict` flag in your `tsconfig.json` file to enforce stricter type checking.
    - This helps catch errors early during development.

    ```json
    // tsconfig.json
    {
      "compilerOptions": {
        "strict": true,
        "module": "esnext",
        "target": "esnext",
        "moduleResolution": "node",
        "esModuleInterop": true,
        "jsx": "react-jsx",
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "noImplicitAny": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true
      }
    }
    ```

  - **Avoid 'any' and Use Alternatives**
    - Avoid using `any` as it bypasses type checking, leading to potential runtime errors.
    - Use more specific types like `string`, `number`, custom types, `unknown`, or union types instead.

    ```typescript
    // ❌ DON'T:
    let data: any;

    // ✅ DO:
    let data: unknown; // Requires type checking
    function processValue(value: unknown) {
      if (typeof value === "string") {
        console.log(value.toUpperCase());
      }
    }
    ```

  - **Use Type Inference and Annotations**
    - Utilize type inference for simple cases where the type is clear.
    - Use explicit type annotations for complex projects, function parameters, and return types to improve clarity.

    ```typescript
    const name = "John"; // TypeScript infers type string

    function greet(name: string): string {
      return `Hello, ${name}`;
    }
    ```

  - **Organize Code with Modules**
    - Break code into smaller, reusable modules using `export` and `import` keywords.
    - Use ES6 module syntax for better compatibility and maintainability.

    ```typescript
    // utils.ts
    export function add(a: number, b: number): number {
      return a + b;
    }
    ```

    ```typescript
    // main.ts
    import { add } from './utils';
    console.log(add(2, 3));
    ```

  - **Integration with Third-Party Tools**
    - Integrate TypeScript with build tools like Webpack, Rollup, or Parcel for a seamless development workflow.
    - Use DefinitelyTyped (`@types/*`) or package-provided type definitions for third-party libraries.

    ```bash
    npm install --save-dev @types/lodash
    ```

    ```typescript
    import _ from 'lodash';
    const numbers = [1, 2, 3];
    console.log(_.reverse(numbers));
    ```

  - **Consistent Coding Style with ESLint and Prettier**
    - Maintain a consistent coding style using ESLint and Prettier.
    - Configure ESLint with TypeScript-specific rules and integrate Prettier for automatic code formatting.

    ```json
    // .eslintrc.json
    {
      "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
      "parser": "@typescript-eslint/parser",
      "plugins": ["@typescript-eslint"]
    }
    ```

    ```json
    // .prettierrc
    {
      "singleQuote": true,
      "trailingComma": "all"
    }
    ```

  - **Document Code for Scalability**
    - Document code using JSDoc comments to improve maintainability, especially for complex projects.
    - Use tools like TypeDoc to generate documentation from TypeScript comments.
    ```typescript
    /**
     * Adds two numbers together.
     * @param a The first number.
     * @param b The second number.
     * @returns The sum of the two numbers.
     */
    function add(a: number, b: number): number {
      return a + b;
    }
    ```

- **Advanced TypeScript Best Practices**
  - Focuses on more advanced features and techniques for writing robust and flexible code.

  - **Importance of Generics**
    - Utilize generics to create reusable components and functions that can operate on multiple data types while maintaining type safety.
    - Provide default values for generic parameters and use constraints to ensure generic types adhere to specific structures or interfaces.

    ```typescript
    function mergeObjects<T extends object, U extends object>(
      obj1: T,
      obj2: U
    ): T & U {
      return { ...obj1, ...obj2 };
    }
    ```

  - **Union and Intersection Types**
    - Implement union and intersection types for better flexibility and precision.
    - Use union types when a variable can hold values of different types.
    - Use intersection types to combine multiple types into one.

    ```typescript
    // Union Type
    let id: number | string;
    id = 101; // valid
    id = "A101"; // valid

    // Intersection Type
    interface Person {
      name: string;
    }
    interface Employee {
      employeeId: number;
    }
    type EmployeeDetails = Person & Employee;
    const employee: EmployeeDetails = { name: 'Alice', employeeId: 123 };
    ```

  - **Access Modifiers for Encapsulation**
    - Control the visibility of class members using access modifiers (`public`, `private`, `protected`).
    - Use `private` to restrict access within the class itself.
    - Use `protected` for inheritance when you want access to the class and its subclasses.

    ```typescript
    class Person {
      private name: string;

      constructor(name: string) {
        this.name = name;
      }

      getName(): string {
        return this.name;
      }
    }

    class Employee extends Person {
      protected employeeId: number;

      constructor(name: string, employeeId: number) {
        super(name);
        this.employeeId = employeeId;
      }

      getEmployeeId(): number {
        return this.employeeId;
      }
    }

    const emp = new Employee('Alice', 123);
    console.log(emp.getName()); // valid
    // console.log(emp.employeeId); // Error: Property 'employeeId' is protected
    ```

  - **Utilize Enums for Readable Constants**
    - Define a set of named constants using enums to make code more readable and maintainable.
    - Use string enums for clarity when the meaning of the value is more important than its numeric position.

    ```typescript
    enum Direction {
      Up = 'UP',
      Down = 'DOWN',
      Left = 'LEFT',
      Right = 'RIGHT',
    }

    function move(direction: Direction) {
      console.log(`Moving ${direction}`);
    }

    move(Direction.Up);
    ```

  - **Error Handling**
    - Implement effective error handling using `try-catch` blocks to handle exceptions.
    - Define custom error types to categorize errors more efficiently.

    ```typescript
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }

    function riskyOperation() {
      throw new CustomError('Something went wrong!');
    }

    try {
      riskyOperation();
    } catch (error) {
      if (error instanceof CustomError) {
        console.error(error.message);
      }
    }
    ```

  - **Code Readability**
    - Prioritize code readability by using meaningful variable names, consistent formatting, and clear comments.
    - Conduct regular code reviews to identify and address readability issues.
    ```typescript
    /**
     * Adds two numbers together.
     * @param a The first number.
     * @param b The second number.
     * @returns The sum of the two numbers.
     */
    function add(a: number, b: number): number {
      return a + b;
    }
    ```

- **Code Organization and Structure**
  - **Directory Structure Best Practices**
    - Organize code into feature-based or module-based directories.
    - Use a `src` directory to contain all source code.
    - Separate concerns into logical directories like `components`, `services`, `utils`, `models`, and `types`.

    ```
    project/
    ├── src/
    │   ├── components/
    │   │   ├── Button.tsx
    │   │   └── Input.tsx
    │   ├── services/
    │   │   └── apiService.ts
    │   ├── utils/
    │   │   └── helpers.ts
    │   ├── models/
    │   │   └── user.ts
    │   ├── types/
    │   │   └── index.d.ts
    │   ├── App.tsx
    │   └── index.tsx
    ├── public/
    ├── tsconfig.json
    ├── package.json
    └── README.md
    ```

  - **File Naming Conventions**
    - Use PascalCase for component files (e.g., `Button.tsx`).
    - Use camelCase for utility files and functions (e.g., `apiService.ts`, `helpers.ts`).
    - Use `.ts` extension for TypeScript files and `.tsx` for files containing JSX.

  - **Module Organization**
    - Organize related functions, variables, and classes into logical modules.
    - Use `export` and `import` to manage dependencies between modules.
    - Avoid circular dependencies between modules.

  - **Component Architecture Recommendations**
    - For React/JSX projects, follow the component-based architecture.
    - Separate components into smaller, reusable units.
    - Use functional components with hooks for managing state and side effects.

  - **Code Splitting Strategies**
    - Use dynamic imports (`import()`) to load modules on demand.
    - Implement lazy loading for components and routes.
    - Split large bundles into smaller chunks to improve initial load time.

- **Common Patterns and Anti-patterns**
  - **Design Patterns**
    - **Singleton:** Ensures a class only has one instance.
    - **Factory:** Creates objects without specifying the exact class to create.
    - **Observer:** Defines a one-to-many dependency between objects.
    - **Strategy:** Defines a family of algorithms and makes them interchangeable.

  - **Recommended Approaches**
    - Use interfaces to define contracts for objects and functions.
    - Prefer composition over inheritance to create flexible and reusable code.
    - Use discriminated unions to represent different states of an object.

  - **Anti-patterns and Code Smells**
    - **Overusing `!` non-null assertion operator:** Can hide potential null/undefined errors.
    - **Ignoring TypeScript errors:** Defeats the purpose of using TypeScript.
    - **Complex conditional logic:** Simplify logic using appropriate design patterns or refactoring.

  - **State Management**
    - Use state management libraries like Redux, Zustand, or Context API for complex applications.
    - Follow unidirectional data flow principles.
    - Use immutable data structures to avoid unexpected side effects.

  - **Error Handling**
    - Use `try-catch` blocks to handle synchronous errors.
    - Use `.catch()` method to handle asynchronous errors (Promises).
    - Create custom error classes for specific error scenarios.

- **Common Pitfalls and Gotchas**
  - **Frequent Mistakes**
    - Incorrectly configuring `tsconfig.json`.
    - Misusing `!` non-null assertion operator.
    - Overusing type assertions.
    - Ignoring TypeScript errors.

  - **Edge Cases**
    - Handling `null` and `undefined` values.
    - Dealing with asynchronous operations and Promises.
    - Working with complex type definitions.
