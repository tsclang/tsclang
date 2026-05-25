#include "runtime.h"

typedef struct { int32_t first; double second; } Pair_i32_f64;
typedef struct { double first; int32_t second; } Pair_f64_i32;

static Pair_i32_f64 Pair_i32_f64_new(int32_t a, double b) {
    Pair_i32_f64 self = {0};
    self.first = a;
    self.second = b;
    return self;
}

static Pair_f64_i32 Pair_f64_i32_new(double a, int32_t b) {
    Pair_f64_i32 self = {0};
    self.first = a;
    self.second = b;
    return self;
}

static Pair_i32_f64 Pair_f64_i32_swap(Pair_f64_i32 *self) {
    return Pair_i32_f64_new(self->second, self->first);
}

static Pair_f64_i32 Pair_i32_f64_swap(Pair_i32_f64 *self) {
    return Pair_f64_i32_new(self->second, self->first);
}

int main(void) {
    TSC_INIT();
    Pair_i32_f64 p = Pair_i32_f64_new(1, 2.5);
    Pair_f64_i32 s = Pair_i32_f64_swap(&p);
    printf("%g\n", (double)(s.first));
    printf("%d\n", s.second);
    return 0;
}
