#include "runtime.h"

typedef struct {
    int32_t _state;
    int32_t _result;
    bool _done;
} simple_state;

static void simple_poll(simple_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 5 * 2;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
