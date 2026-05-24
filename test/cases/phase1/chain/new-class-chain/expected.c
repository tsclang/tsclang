#include "runtime.h"

typedef struct { int32_t a; int32_t b; } Pair;
typedef struct { Pair pair; } Wrapper;

static Pair Pair_new(int32_t a, int32_t b) {
    Pair self = {0};
    self.a = a;
    self.b = b;
    return self;
}

static int32_t Pair_sum(const Pair *self) {
    return self->a + self->b;
}

static Wrapper Wrapper_new(int32_t x, int32_t y) {
    Wrapper self = {0};
    self.pair = Pair_new(x, y);
    return self;
}

static Pair Wrapper_getPair(const Wrapper *self) {
    return self->pair;
}

int main(void) {
    TSC_INIT();
    Wrapper _chain_0 = Wrapper_new(3, 4);
    Pair _chain_1 = Wrapper_getPair(&_chain_0);
    printf("%d\n", Pair_sum(&_chain_1));
    return 0;
}
