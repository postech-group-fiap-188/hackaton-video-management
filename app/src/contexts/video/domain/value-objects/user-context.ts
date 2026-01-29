export type UserContextProps = {
  id: string;

  email?: string;

  [k: string]: string | undefined;
};
export class UserContext {
  private readonly props: UserContextProps;

  private constructor(props: UserContextProps) {
    this.props = Object.freeze({ ...props });
  }

  static create(props: UserContextProps): UserContext {
    const id = (props?.id ?? '').trim();
    if (!id) throw new Error('UserContext: missing id');
    return new UserContext({ ...(props ?? id) });
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string | undefined {
    return this.props.email;
  }

  get<T extends string>(k: T): string | undefined {
    return this.props[k];
  }

  toProps(): UserContextProps {
    return { ...this.props };
  }
}
