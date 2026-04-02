#include "runtime.h"

typedef struct {
    int32_t _state;
    int32_t _result;
    bool _done;
    int32_t x;
} counter_state;

static void counter_poll(counter_state *self) {
    switch (self->_state) {
        case 0:
            self->x = 0;
            self->x += 1;
            self->_result = self->x;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
