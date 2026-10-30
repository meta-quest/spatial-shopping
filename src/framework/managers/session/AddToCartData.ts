/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** Cart payload sent when products are added during a session. */
export interface AddToCartData {
  sessionId: string;
  products: Record<string, CartEntryData>;
}

/** Product purchase information for cart, containing display data and quantity. */
export class CartEntryData {
  public id: string;
  public title: string;
  public subtitle?: string;
  public price: string;
  public rating?: { score: number; count: number };
  public assetUrl: string;
  private _quantity: number;
  private onQuantityChangeCallbacks: Array<(newQuantity: number) => void> = [];
  private onRemoveCallbacks: Array<() => void> = [];

  constructor(data: {
    id: string;
    title: string;
    price: string;
    assetUrl: string;
    subtitle?: string;
    rating?: { score: number; count: number };
    quantity?: number;
  }) {
    {
      this.id = data.id;
      this.title = data.title;
      this.subtitle = data.subtitle;
      this.price = data.price;
      this.rating = data.rating;
      this.assetUrl = data.assetUrl;
      this._quantity = data.quantity ?? 1;
    }
  }

  /** Subscribe to quantity change events */
  public onQuantityChange(callback: (newQuantity: number) => void): () => void {
    this.onQuantityChangeCallbacks.push(callback);
    return () => this.offQuantityChange(callback);
  }

  /** Unsubscribe from quantity change events */
  public offQuantityChange(callback: (newQuantity: number) => void): void {
    const index = this.onQuantityChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.onQuantityChangeCallbacks.splice(index, 1);
    }
  }

  /** Subscribe to remove events */
  public onRemove(callback: () => void): () => void {
    this.onRemoveCallbacks.push(callback);
    return () => this.offRemove(callback);
  }

  /** Unsubscribe from remove events */
  public offRemove(callback: () => void): void {
    const index = this.onRemoveCallbacks.indexOf(callback);
    if (index > -1) {
      this.onRemoveCallbacks.splice(index, 1);
    }
  }

  /** Get the current quantity of the cart entry */
  get quantity(): number {
    return this._quantity;
  }

  /** Set the quantity of the cart entry */
  public setQuantity(quantity: number): void {
    if (quantity <= 0) {
      this.onRemoveCallbacks.forEach((callback) => callback());
      this.onRemoveCallbacks = [];
      this.onQuantityChangeCallbacks = [];
      return;
    }

    this._quantity = quantity;
    this.onQuantityChangeCallbacks.forEach((callback) =>
      callback(this._quantity),
    );
  }

  /** Increment the quantity of the cart entry */
  public incrementQuantity(delta: number = 1): void {
    this.setQuantity(this._quantity + delta);
  }

  /** Decrement the quantity of the cart entry */
  public decrementQuantity(delta: number = 1): void {
    this.setQuantity(this._quantity - delta);
  }

  /** Convert the cart entry to a JSON object */
  public toJSON() {
    return {
      id: this.id,
      title: this.title,
      subtitle: this.subtitle,
      price: this.price,
      rating: this.rating,
      assetUrl: this.assetUrl,
      quantity: this._quantity,
    };
  }
}
