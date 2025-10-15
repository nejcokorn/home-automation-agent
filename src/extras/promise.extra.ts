// Class representing a timeout error
export class TimeoutError extends Error {
	constructor(message = "Operation timed out") {
		super(message);
		this.name = "TimeoutError";
	}
}

// Extended Promise with a timeout method
export class ExtraPromise<T> extends Promise<T> {
	// Ensure derived methods (then/catch/finally) return a plain Promise
	static get [Symbol.species]() { return Promise; }

	constructor(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: any) => void
		) => void
	) {
		// Forward the executor to the base class
		super(executor);
	}

	// Add a timeout to the Promise
	timeout(ms: number): Promise<T> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			// const id = setTimeout(() => reject(new TimeoutError()), ms);
			const id = setTimeout(() => reject("Operation timed out"), ms);
			// Clear the timer when the promise settles
			this.finally(() => clearTimeout(id));
		});

		// Return whichever settles first (result or timeout)
		return Promise.race([this, timeoutPromise]) as Promise<T>;
	}
}