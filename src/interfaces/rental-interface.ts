export interface Rental {
    id: number;
    carId: number;
    userId: number;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    startIso?: string;
    endIso?: string;
    rent_id?: number;
    rental_id?: number;
    user_id?: number;
    start_data?: string;
    start_date?: string;
    end_data?: string;
    end_date?: string;
}

export interface RentalPayload {
    startDate: string;
    endDate: string;
}

export interface AddRentalPayload extends RentalPayload {
    carId: number;
}
