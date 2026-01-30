export type UserContextProps = {
  id: string;
  email?: string;

  /**
   * Extra attributes carried from the request context (e.g. tenantId, role, etc).
   * Keep it explicit to avoid a "bag of strings" leaking into the domain.
   */
  attributes?: Record<string, string | undefined>;
};

export class UserContext {
  private readonly props: UserContextProps;

  private constructor(props: UserContextProps) {
    // Entity can be immutable as well; identity is the important part here.
    this.props = Object.freeze({
      ...props,
      attributes: Object.freeze({ ...(props.attributes ?? {}) }),
    });
  }

  static create(props: UserContextProps): UserContext {
    const id = (props?.id ?? '').trim();
    if (!id) throw new Error('UserContext: missing id');

    const email = props.email?.trim() || undefined;

    return new UserContext({
      ...props,
      id,
      email,
      attributes: props.attributes ?? {},
    });
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string | undefined {
    return this.props.email;
  }

  getAttr(key: string): string | undefined {
    return this.props.attributes?.[key];
  }

  toProps(): UserContextProps {
    return {
      id: this.props.id,
      email: this.props.email,
      attributes: { ...(this.props.attributes ?? {}) },
    };
  }

  /**
   * Entity equality: identity-based.
   */
  equals(other?: UserContext): boolean {
    if (!other) return false;
    return this.id === other.id;
  }
}
