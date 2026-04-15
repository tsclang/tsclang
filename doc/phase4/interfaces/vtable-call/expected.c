#include "runtime.h"

typedef struct { void (*draw)(void *self); } Drawable_vtable;
typedef struct { void *self; const Drawable_vtable *vtable; } Drawable;

typedef struct { double radius; } Circle;

static void Circle_draw(const Circle *self) {
    printf("circle\n");
}

void render_Drawable(Drawable d) {
    d.vtable->draw(d.self);
}

static const Drawable_vtable _Circle_Drawable_vtable = {
    .draw = (void (*)(void *))Circle_draw,
};

int main(void) {
    TSC_INIT();
    Circle c = {0};
    c.radius = 1.0;
    Drawable _d_c = { .self = &c, .vtable = &_Circle_Drawable_vtable };
    render_Drawable(_d_c);
    return 0;
}
