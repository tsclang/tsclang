#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct {
    int32_t _state; bool _done;
    Array_i32 arr;
} foo_state;
static int32_t _arr_data_0[] = {1, 2, 3};

static void foo_poll(foo_state *self) {
    switch (self->_state) {
        case 0:
            self->arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 0};
            printf("%zu\n", self->arr.length);
            goto _cleanup;
        _cleanup:
            tsc_array_free_i32(&self->arr);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
