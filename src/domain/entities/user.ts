export type UserProps = {
  id: string;
  email?: string;
  name?: string;
  attributes?: Record<string, string | undefined>;
};

export class User {
  private readonly props: UserProps;

  private constructor(props: UserProps) {
    this.props = Object.freeze({
      ...props,
      attributes: Object.freeze({ ...(props.attributes ?? {}) }),
    });
  }

  static create(props: UserProps): User {
    const id = (props?.id ?? '').trim();
    if (!id) throw new Error('User: missing id');

    const email = props.email?.trim() || undefined;
    const name = props.name?.trim() || undefined;

    return new User({
      ...props,
      id,
      email,
      name,
      attributes: props.attributes ?? {},
    });
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string | undefined {
    return this.props.email;
  }

  get name(): string | undefined {
    return this.props.name;
  }

  getAttr(key: string): string | undefined {
    return this.props.attributes?.[key];
  }

  toProps(): UserProps {
    return {
      id: this.props.id,
      email: this.props.email,
      name: this.props.name,
      attributes: { ...(this.props.attributes ?? {}) },
    };
  }

  equals(other?: User): boolean {
    if (!other) return false;
    return this.id === other.id;
  }
}
