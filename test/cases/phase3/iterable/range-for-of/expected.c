#include "runtime.h"

typedef struct { int32_t start; int32_t end_; } Range;
typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { int32_t i; int32_t e; } Range_iter_t;

static Range Range_new(int32_t start, int32_t end_) {
    Range self = {0};
    self.start = start;
    self.end_ = end_;
    return self;
}

static opt_i32 Range_iter_next(Range_iter_t *_self) {
    if (_self->i >= _self->e) {
        return (opt_i32){false, 0};
    }
    return (opt_i32){true, _self->i++};
}

static Range_iter_t Range_iter(const Range *_self) {
    int32_t i = _self->start;
    const int32_t e = _self->end_;
    return (Range_iter_t){.i = i, .e = e};
}

int main(void) {
    TSC_INIT();
    Range r = Range_new(0, 3);
    Range_iter_t _iter_0 = Range_iter(&r);
    opt_i32 _elem_0;
    while ((_elem_0 = Range_iter_next(&_iter_0)).has_value) {
        const int32_t x = _elem_0.value;
        printf("%d\n", x);
    }
    return 0;
}
