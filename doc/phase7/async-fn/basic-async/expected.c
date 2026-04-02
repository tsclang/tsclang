#include "runtime.h"

typedef struct {
    int32_t _state;
    int32_t _result;
    bool _done;
} getValue_state;

static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
