#include "runtime.h"

typedef struct { int32_t count; } Counter;
typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { int32_t i; int32_t n; } Counter_iter_t;

static Counter Counter_new(int32_t count) {
    Counter self = {0};
    self.count = count;
    return self;
}

static opt_i32 Counter_iter_next(Counter_iter_t *_self) {
    if (_self->i >= _self->n) {
        return (opt_i32){false, 0};
    }
    return (opt_i32){true, _self->i++};
}

static Counter_iter_t Counter_iter(const Counter *_self) {
    int32_t i = 0;
    const int32_t n = _self->count;
    return (Counter_iter_t){.i = i, .n = n};
}

int main(void) {
    TSC_INIT();
    Counter c = Counter_new(3);
    Counter_iter_t _iter_0 = Counter_iter(&c);
    opt_i32 _elem_0 = {0};
    while ((_elem_0 = Counter_iter_next(&_iter_0)).has_value) {
        const int32_t x = _elem_0.value;
        printf("%d\n", x);
    }
    return 0;
}
